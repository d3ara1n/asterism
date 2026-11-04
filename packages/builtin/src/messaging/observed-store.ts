import type { DatabaseSync } from "node:sqlite";
import { messageSchema, type ConversationAddress, type ConversationList, type ConversationQuery, type Json, type MessageList, type MessageQuery, type MessagingConversation, type MessagingMessage } from "@asterism-app/sdk/contracts";
import { ensureMessagingSchema } from "./storage-schema.ts";
import { decodeObservedCursor, encodeObservedCursor, translateSequence, type SequenceShift } from "./cursor.ts";

/** Decode retained text-only observations without changing their identity or polling position. */
function storedMessage(data: string): MessagingMessage {
  const value = JSON.parse(data);
  if (!value.parts && typeof value.text === "string") {
    const { text, ...rest } = value;
    return messageSchema.parse({ ...rest, parts: [{ kind: "text", text }] });
  }
  return messageSchema.parse(value);
}

interface Row { data: string; sequence: number; discovered?: number }
/** Account keys start with the connection ID and include the provider's external identity. */
export function forgetObservedConnection(db: DatabaseSync, connectionId: string): void {
  ensureMessagingSchema(db);
  const prefix = `${JSON.stringify([connectionId]).slice(0, -1)},`;
  db.exec("BEGIN");
  try {
    for (const table of ["messaging_messages", "messaging_dialogs", "messaging_provider_state", "messaging_message_aliases",
      "messaging_file_aliases", "messaging_cursor_scopes", "messaging_accounts"])
      db.prepare(`DELETE FROM ${table} WHERE substr(account, 1, length(?)) = ?`).run(prefix, prefix);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

/** Provider-owned observations, shared by all consumers and retained across connection restarts. */
export class ObservedMessages {
  constructor(private readonly db: DatabaseSync, readonly account: string) {
    ensureMessagingSchema(db);
    db.prepare("INSERT OR IGNORE INTO messaging_accounts(account) VALUES (?)").run(account);
  }
  private sequence(): number {
    return (this.db.prepare("SELECT sequence FROM messaging_accounts WHERE account = ?").get(this.account) as { sequence: number }).sequence;
  }
  private cursor(cursor: string | undefined, scope: string, latest: number): number | null {
    return decodeObservedCursor(cursor, scope, latest, (source, sequence) => {
      const row = this.db.prepare("SELECT max_sequence, shifts FROM messaging_cursor_scopes WHERE account = ? AND source = ? AND target = ?")
        .get(this.account, source, scope) as { max_sequence: number; shifts: string } | undefined;
      return row && sequence <= row.max_sequence ? translateSequence(sequence, JSON.parse(row.shifts) as SequenceShift[]) : undefined;
    });
  }
  state(key: string): Json | undefined {
    const row = this.db.prepare("SELECT data FROM messaging_provider_state WHERE account = ? AND key = ?")
      .get(this.account, key) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as Json : undefined;
  }
  setState(key: string, value: Json): void {
    this.db.prepare(`INSERT INTO messaging_provider_state VALUES (?, ?, ?)
      ON CONFLICT(account, key) DO UPDATE SET data = excluded.data`).run(this.account, key, JSON.stringify(value));
  }
  /** Alias targets are canonical platform message IDs, scoped to this account and conversation. */
  alias(chat: string, alias: string, messageId: string): void {
    this.db.prepare(`INSERT INTO messaging_message_aliases VALUES (?, ?, ?, ?)
      ON CONFLICT(account, chat, alias) DO UPDATE SET message_id = excluded.message_id`).run(this.account, chat, alias, messageId);
  }
  resolveId(chat: string, id: string): string {
    const row = this.db.prepare("SELECT message_id FROM messaging_message_aliases WHERE account = ? AND chat = ? AND alias = ?")
      .get(this.account, chat, id) as { message_id: string } | undefined;
    return row?.message_id ?? id;
  }
  private decode(chat: string, data: string): MessagingMessage {
    const message = storedMessage(data);
    return message.replyTo ? { ...message, replyTo: this.resolveId(chat, message.replyTo) } : message;
  }
  message(chat: string, id: string): MessagingMessage | undefined {
    const row = this.db.prepare("SELECT data FROM messaging_messages WHERE account = ? AND chat = ? AND id = ?")
      .get(this.account, chat, this.resolveId(chat, id)) as { data: string } | undefined;
    return row ? this.decode(chat, row.data) : undefined;
  }
  fileMessage(chat: string, messageId: string, fileId: string): MessagingMessage | undefined {
    const message = this.message(chat, messageId);
    if (message?.parts.some(part => part.kind === "file" && part.id === fileId)) return message;
    const row = this.db.prepare("SELECT target_id FROM messaging_file_aliases WHERE account = ? AND chat = ? AND message_id = ? AND file_id = ?")
      .get(this.account, chat, messageId, fileId) as { target_id: string } | undefined;
    return row ? this.message(chat, row.target_id) : undefined;
  }
  group(address: ConversationAddress, groupId: string): MessagingMessage[] {
    const rows = this.db.prepare(`SELECT data FROM messaging_messages
      WHERE account = ? AND chat = ? AND (? IS NULL OR thread = ?) AND json_extract(data, '$.groupId') = ?
      ORDER BY sequence`).all(this.account, address.conversationId, address.threadId ?? null, address.threadId ?? "", groupId) as { data: string }[];
    return rows.map(row => this.decode(address.conversationId, row.data));
  }
  conversation({ conversationId, threadId }: ConversationAddress): MessagingConversation | undefined {
    const row = this.db.prepare("SELECT data FROM messaging_dialogs WHERE account = ? AND chat = ? AND thread = ?")
      .get(this.account, conversationId, threadId ?? "") as { data: string } | undefined;
    return row ? JSON.parse(row.data) as MessagingConversation : undefined;
  }
  observe(conversation: MessagingConversation, message: MessagingMessage): { discovered: boolean; inserted: boolean } {
    const thread = conversation.threadId ?? "";
    const encoded = JSON.stringify(messageSchema.parse(message));
    const existing = this.db.prepare("SELECT discovered FROM messaging_dialogs WHERE account = ? AND chat = ? AND thread = ?")
      .get(this.account, conversation.conversationId, thread) as { discovered: number } | undefined;
    const prior = this.message(conversation.conversationId, message.id);
    if (prior && JSON.stringify(prior) === encoded && existing) return { discovered: false, inserted: false };
    this.db.exec("BEGIN");
    try {
      const sequence = this.sequence() + 1;
      this.db.prepare("UPDATE messaging_accounts SET sequence = ? WHERE account = ?").run(sequence, this.account);
      this.db.prepare(`INSERT INTO messaging_dialogs VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account, chat, thread) DO UPDATE SET data=excluded.data, sequence=excluded.sequence`)
        .run(this.account, conversation.conversationId, thread, JSON.stringify(conversation), existing?.discovered ?? sequence, sequence);
      this.db.prepare(`INSERT INTO messaging_messages VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account, chat, id) DO UPDATE SET data=excluded.data, thread=excluded.thread, sequence=excluded.sequence`)
        .run(this.account, conversation.conversationId, message.id, message.threadId ?? thread, encoded, sequence);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return { discovered: !existing, inserted: !prior };
  }
  list(query: ConversationQuery): ConversationList {
    const latest = this.sequence(), since = this.cursor(query.since, `${this.account}/dialogs`, latest);
    const rows = this.db.prepare(`SELECT data, sequence, discovered FROM messaging_dialogs
      WHERE account = ? AND sequence > ? ORDER BY sequence DESC`).all(this.account, since ?? -1) as unknown as Row[];
    return {
      conversations: rows.map(row => ({ ...JSON.parse(row.data) as MessagingConversation,
        ...(since === null ? {} : { change: row.discovered! > since ? "discovered" as const : "messages" as const }) })),
      cursor: encodeObservedCursor(`${this.account}/dialogs`, latest), truncated: false,
    };
  }
  read(query: MessageQuery): MessageList {
    if ("messageIds" in query) {
      const messages: MessagingMessage[] = [], missingIds: string[] = [];
      const found = new Set<string>();
      for (const id of new Set(query.messageIds)) {
        const message = this.message(query.conversationId, id);
        if (message && (!query.threadId || message.threadId === query.threadId || message.id === query.threadId)) {
          if (!found.has(message.id)) { found.add(message.id); messages.push(message); }
        } else missingIds.push(id);
      }
      return { messages, missingIds, truncated: false };
    }
    const latest = this.sequence();
    const scope = JSON.stringify([this.account, query.conversationId, query.threadId ?? null]);
    const since = this.cursor(query.since, scope, latest), limit = query.limit ?? 50;
    const rows = this.db.prepare(`SELECT data, sequence FROM messaging_messages
      WHERE account = ? AND chat = ? AND (? IS NULL OR thread = ? OR id = ?) AND sequence > ?
      ORDER BY sequence ${since === null ? "DESC" : "ASC"} LIMIT ?`)
      .all(this.account, query.conversationId, query.threadId ?? null, query.threadId ?? "", query.threadId ?? "", since ?? -1, limit + 1) as unknown as Row[];
    const selected = rows.slice(0, limit);
    if (since === null) selected.reverse();
    const position = since === null ? latest : selected.at(-1)?.sequence ?? latest;
    return { messages: selected.map(row => this.decode(query.conversationId, row.data)),
      cursor: encodeObservedCursor(scope, position), truncated: rows.length > limit };
  }
}
