import type { DatabaseSync } from "node:sqlite";
import { MessagingError } from "@asterism-app/sdk/runtime";
import type { ConversationList, ConversationQuery, MessageList, MessageQuery, MessagingConversation, MessagingMessage } from "@asterism-app/sdk/contracts";

interface Row { data: string; sequence: number; discovered?: number }
export function encodeTelegramCursor(account: string, sequence: number): string {
  return Buffer.from(JSON.stringify([account, sequence])).toString("base64url");
}
export function decodeTelegramCursor(cursor: string | undefined, account: string, latest: number): number | null {
  if (cursor === undefined) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && value[0] === account &&
      Number.isSafeInteger(value[1]) && value[1] >= 0 && value[1] <= latest) return value[1];
  } catch { /* Invalid opaque cursors are reported at the provider boundary. */ }
  throw new MessagingError("invalid_cursor", "The cursor does not belong to this Telegram query or its stored history.");
}
/** Account keys bind a connection to one bot identity, so a replaced token does not inherit another bot's history. */
export function telegramAccount(connectionId: string, botId: number): string {
  return JSON.stringify([connectionId, botId]);
}
function ensureSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_accounts (
      account TEXT PRIMARY KEY, offset INTEGER NOT NULL DEFAULT 0, sequence INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS telegram_dialogs (
      account TEXT NOT NULL, chat TEXT NOT NULL, thread TEXT NOT NULL,
      data TEXT NOT NULL, discovered INTEGER NOT NULL, sequence INTEGER NOT NULL,
      PRIMARY KEY (account, chat, thread)
    );
    CREATE TABLE IF NOT EXISTS telegram_messages (
      account TEXT NOT NULL, chat TEXT NOT NULL, id TEXT NOT NULL, thread TEXT NOT NULL,
      data TEXT NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY (account, chat, id)
    );
  `);
}
/** Delete every bot identity's observations for a removed connection. */
export function forgetTelegramConnection(db: DatabaseSync, connectionId: string): void {
  ensureSchema(db);
  const prefix = `${JSON.stringify([connectionId]).slice(0, -1)},`;
  db.exec("BEGIN");
  try {
    for (const table of ["telegram_messages", "telegram_dialogs", "telegram_accounts"])
      db.prepare(`DELETE FROM ${table} WHERE substr(account, 1, length(?)) = ?`).run(prefix, prefix);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

/** Telegram's observed history is provider-owned and shared by every consumer of this connection. */
export class TelegramStore {
  constructor(private readonly db: DatabaseSync, readonly account: string) {
    ensureSchema(db);
    db.prepare("INSERT OR IGNORE INTO telegram_accounts(account) VALUES (?)").run(account);
  }
  private state() {
    return this.db.prepare("SELECT offset, sequence FROM telegram_accounts WHERE account = ?").get(this.account) as { offset: number; sequence: number };
  }
  offset() { return this.state().offset; }
  advance(offset: number) {
    this.db.prepare("UPDATE telegram_accounts SET offset = ? WHERE account = ?").run(offset, this.account);
  }
  record(conversation: MessagingConversation, message: MessagingMessage): boolean {
    const thread = conversation.threadId ?? "";
    const existing = this.db.prepare("SELECT discovered FROM telegram_dialogs WHERE account = ? AND chat = ? AND thread = ?")
      .get(this.account, conversation.conversationId, thread) as { discovered: number } | undefined;
    this.db.exec("BEGIN");
    try {
      const sequence = this.state().sequence + 1;
      this.db.prepare("UPDATE telegram_accounts SET sequence = ? WHERE account = ?").run(sequence, this.account);
      this.db.prepare(`INSERT INTO telegram_dialogs VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account, chat, thread) DO UPDATE SET data=excluded.data, sequence=excluded.sequence`)
        .run(this.account, conversation.conversationId, thread, JSON.stringify(conversation), existing?.discovered ?? sequence, sequence);
      this.db.prepare(`INSERT INTO telegram_messages VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account, chat, id) DO UPDATE SET data=excluded.data, thread=excluded.thread, sequence=excluded.sequence`)
        .run(this.account, conversation.conversationId, message.id, thread, JSON.stringify(message), sequence);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return !existing;
  }
  list(query: ConversationQuery): ConversationList {
    const latest = this.state().sequence, since = decodeTelegramCursor(query.since, `${this.account}/dialogs`, latest);
    const rows = this.db.prepare(`SELECT data, sequence, discovered FROM telegram_dialogs
      WHERE account = ? AND sequence > ? ORDER BY sequence DESC`).all(this.account, since ?? -1) as unknown as Row[];
    return {
      conversations: rows.map(row => ({ ...JSON.parse(row.data) as MessagingConversation,
        ...(since === null ? {} : { change: row.discovered! > since ? "discovered" as const : "messages" as const }) })),
      cursor: encodeTelegramCursor(`${this.account}/dialogs`, latest), truncated: false,
    };
  }
  read(query: MessageQuery): MessageList {
    const latest = this.state().sequence;
    const scope = JSON.stringify([this.account, query.conversationId, query.threadId ?? null]);
    const since = decodeTelegramCursor(query.since, scope, latest), limit = query.limit ?? 50;
    const order = since === null ? "DESC" : "ASC";
    const rows = this.db.prepare(`SELECT data, sequence FROM telegram_messages
      WHERE account = ? AND chat = ? AND (? IS NULL OR thread = ?) AND sequence > ?
      ORDER BY sequence ${order} LIMIT ?`)
      .all(this.account, query.conversationId, query.threadId ?? null, query.threadId ?? "", since ?? -1, limit + 1) as unknown as Row[];
    const selected = rows.slice(0, limit);
    if (since === null) selected.reverse();
    // Initial reads show the latest messages; subsequent reads continue forward through newly observed messages.
    const position = since === null ? latest : selected.at(-1)?.sequence ?? latest;
    return { messages: selected.map(row => JSON.parse(row.data) as MessagingMessage),
      cursor: encodeTelegramCursor(scope, position), truncated: rows.length > limit };
  }
}
