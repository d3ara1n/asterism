import type { DatabaseSync } from "node:sqlite";
import { MessagingError } from "@asterism-app/sdk/runtime";
import { messageSchema, type ConversationList, type ConversationQuery, type MessageList, type MessageQuery, type MessagingConversation, type MessagingMessage } from "@asterism-app/sdk/contracts";

/** Decode retained text-only observations without changing their identity or polling position. */
function storedMessage(data: string): MessagingMessage {
  const value = JSON.parse(data);
  if (!value.parts && typeof value.text === "string") {
    const { text, ...rest } = value;
    return messageSchema.parse({ ...rest, parts: [{ kind: "text", text }] });
  }
  return messageSchema.parse(value);
}

type Namespace = "telegram" | "messaging";
interface Row { data: string; sequence: number; discovered?: number }
export function encodeObservedCursor(account: string, sequence: number): string {
  return Buffer.from(JSON.stringify([account, sequence])).toString("base64url");
}
export function decodeObservedCursor(cursor: string | undefined, account: string, latest: number): number | null {
  if (cursor === undefined) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && value[0] === account &&
      Number.isSafeInteger(value[1]) && value[1] >= 0 && value[1] <= latest) return value[1];
  } catch { /* Invalid opaque cursors are reported at the provider boundary. */ }
  throw new MessagingError("invalid_cursor", "The cursor does not belong to this query or its stored history.");
}
function ensureSchema(db: DatabaseSync, namespace: Namespace) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${namespace}_accounts (
      account TEXT PRIMARY KEY, sequence INTEGER NOT NULL DEFAULT 0${namespace === "telegram" ? ", offset INTEGER NOT NULL DEFAULT 0" : ""}
    );
    CREATE TABLE IF NOT EXISTS ${namespace}_dialogs (
      account TEXT NOT NULL, chat TEXT NOT NULL, thread TEXT NOT NULL,
      data TEXT NOT NULL, discovered INTEGER NOT NULL, sequence INTEGER NOT NULL,
      PRIMARY KEY (account, chat, thread)
    );
    CREATE TABLE IF NOT EXISTS ${namespace}_messages (
      account TEXT NOT NULL, chat TEXT NOT NULL, id TEXT NOT NULL, thread TEXT NOT NULL,
      data TEXT NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY (account, chat, id)
    );
  `);
}
/** Account keys start with the connection ID and include the provider's external identity; providers name any additional account-keyed tables. */
export function forgetObservedConnection(db: DatabaseSync, connectionId: string, namespace: Namespace = "messaging", tables: readonly string[] = []): void {
  ensureSchema(db, namespace);
  const prefix = `${JSON.stringify([connectionId]).slice(0, -1)},`;
  db.exec("BEGIN");
  try {
    for (const table of [...tables, `${namespace}_messages`, `${namespace}_dialogs`, `${namespace}_accounts`])
      db.prepare(`DELETE FROM ${table} WHERE substr(account, 1, length(?)) = ?`).run(prefix, prefix);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

/** Provider-owned observations, shared by all consumers and retained across connection restarts. */
export class ObservedMessages {
  constructor(protected readonly db: DatabaseSync, readonly account: string, private readonly namespace: Namespace = "messaging") {
    ensureSchema(db, namespace);
    db.prepare(`INSERT OR IGNORE INTO ${namespace}_accounts(account) VALUES (?)`).run(account);
  }
  private sequence(): number {
    return (this.db.prepare(`SELECT sequence FROM ${this.namespace}_accounts WHERE account = ?`).get(this.account) as { sequence: number }).sequence;
  }
  /** Drop a message whose identity a provider has merged into another observation. */
  protected forget(chat: string, id: string): void {
    this.db.prepare(`DELETE FROM ${this.namespace}_messages WHERE account = ? AND chat = ? AND id = ?`).run(this.account, chat, id);
  }
  message(chat: string, id: string): MessagingMessage | undefined {
    const row = this.db.prepare(`SELECT data FROM ${this.namespace}_messages WHERE account = ? AND chat = ? AND id = ?`)
      .get(this.account, chat, id) as { data: string } | undefined;
    return row ? storedMessage(row.data) : undefined;
  }
  observe(conversation: MessagingConversation, message: MessagingMessage): { discovered: boolean; inserted: boolean } {
    const thread = conversation.threadId ?? "", ns = this.namespace;
    const encoded = JSON.stringify(messageSchema.parse(message));
    const existing = this.db.prepare(`SELECT discovered FROM ${ns}_dialogs WHERE account = ? AND chat = ? AND thread = ?`)
      .get(this.account, conversation.conversationId, thread) as { discovered: number } | undefined;
    const prior = this.message(conversation.conversationId, message.id);
    if (prior && JSON.stringify(prior) === encoded && existing) return { discovered: false, inserted: false };
    this.db.exec("BEGIN");
    try {
      const sequence = this.sequence() + 1;
      this.db.prepare(`UPDATE ${ns}_accounts SET sequence = ? WHERE account = ?`).run(sequence, this.account);
      this.db.prepare(`INSERT INTO ${ns}_dialogs VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account, chat, thread) DO UPDATE SET data=excluded.data, sequence=excluded.sequence`)
        .run(this.account, conversation.conversationId, thread, JSON.stringify(conversation), existing?.discovered ?? sequence, sequence);
      this.db.prepare(`INSERT INTO ${ns}_messages VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account, chat, id) DO UPDATE SET data=excluded.data, thread=excluded.thread, sequence=excluded.sequence`)
        .run(this.account, conversation.conversationId, message.id, message.threadId ?? thread, encoded, sequence);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return { discovered: !existing, inserted: !prior };
  }
  list(query: ConversationQuery): ConversationList {
    const latest = this.sequence(), since = decodeObservedCursor(query.since, `${this.account}/dialogs`, latest);
    const rows = this.db.prepare(`SELECT data, sequence, discovered FROM ${this.namespace}_dialogs
      WHERE account = ? AND sequence > ? ORDER BY sequence DESC`).all(this.account, since ?? -1) as unknown as Row[];
    return {
      conversations: rows.map(row => ({ ...JSON.parse(row.data) as MessagingConversation,
        ...(since === null ? {} : { change: row.discovered! > since ? "discovered" as const : "messages" as const }) })),
      cursor: encodeObservedCursor(`${this.account}/dialogs`, latest), truncated: false,
    };
  }
  read(query: MessageQuery): MessageList {
    const latest = this.sequence();
    const scope = JSON.stringify([this.account, query.conversationId, query.threadId ?? null]);
    const since = decodeObservedCursor(query.since, scope, latest), limit = query.limit ?? 50;
    const rows = this.db.prepare(`SELECT data, sequence FROM ${this.namespace}_messages
      WHERE account = ? AND chat = ? AND (? IS NULL OR thread = ? OR id = ?) AND sequence > ?
      ORDER BY sequence ${since === null ? "DESC" : "ASC"} LIMIT ?`)
      .all(this.account, query.conversationId, query.threadId ?? null, query.threadId ?? "", query.threadId ?? "", since ?? -1, limit + 1) as unknown as Row[];
    const selected = rows.slice(0, limit);
    if (since === null) selected.reverse();
    const position = since === null ? latest : selected.at(-1)?.sequence ?? latest;
    return { messages: selected.map(row => storedMessage(row.data)),
      cursor: encodeObservedCursor(scope, position), truncated: rows.length > limit };
  }
}
