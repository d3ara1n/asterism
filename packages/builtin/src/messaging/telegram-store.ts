import type { DatabaseSync } from "node:sqlite";
import { messageSchema, type MessagingConversation, type MessagingMessage } from "@asterism-app/sdk/contracts";
import { ObservedMessages, forgetObservedConnection } from "./observed-store.ts";

/** Account keys bind a connection to one bot identity, so a replaced token does not inherit another bot's history. */
export function telegramAccount(connectionId: string, botId: number): string {
  return JSON.stringify([connectionId, botId]);
}
const membersTable = "telegram_group_members";
function ensureMembers(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${membersTable} (
    account TEXT NOT NULL, chat TEXT NOT NULL, id TEXT NOT NULL, media_group TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (account, chat, id)
  )`);
}
export function forgetTelegramConnection(db: DatabaseSync, connectionId: string): void {
  ensureMembers(db);
  forgetObservedConnection(db, connectionId, "telegram", [membersTable]);
}

export interface TelegramRecord { discovered: boolean; inserted: boolean; message: MessagingMessage }
/**
 * Telegram keeps its polling offset alongside provider-owned observations. Bot API delivers an album as one message per
 * item sharing a media group; the store keeps each item and observes the album as one logical message identified by its
 * first item, so readers, replies, and attachment lookups see a single message.
 */
export class TelegramStore extends ObservedMessages {
  constructor(db: DatabaseSync, account: string) { super(db, account, "telegram"); ensureMembers(db); }
  offset() {
    return (this.db.prepare("SELECT offset FROM telegram_accounts WHERE account = ?").get(this.account) as { offset: number }).offset;
  }
  advance(offset: number) {
    this.db.prepare("UPDATE telegram_accounts SET offset = ? WHERE account = ?").run(offset, this.account);
  }
  private members(chat: string, group: string): MessagingMessage[] {
    const rows = this.db.prepare(`SELECT data FROM ${membersTable} WHERE account = ? AND chat = ? AND media_group = ?
      ORDER BY CAST(id AS INTEGER)`).all(this.account, chat, group) as { data: string }[];
    return rows.map(row => messageSchema.parse(JSON.parse(row.data)));
  }
  /** The logical message ID for a Telegram message ID; album items resolve to their album. */
  logicalId(chat: string, id: string): string {
    const row = this.db.prepare(`SELECT media_group FROM ${membersTable} WHERE account = ? AND chat = ? AND id = ?`)
      .get(this.account, chat, id) as { media_group: string } | undefined;
    return row ? this.members(chat, row.media_group)[0]?.id ?? id : id;
  }
  /** The current logical message of an album. */
  album(chat: string, group: string): MessagingMessage | undefined {
    const first = this.members(chat, group)[0];
    return first ? this.message(chat, first.id) : undefined;
  }
  /** Record one Telegram message; inserted reports a newly observed message or album item. */
  record(conversation: MessagingConversation, message: MessagingMessage, group?: string): TelegramRecord {
    const chat = conversation.conversationId;
    const value = message.replyTo ? { ...message, replyTo: this.logicalId(chat, message.replyTo) } : message;
    if (!group) return { ...this.observe(conversation, value), message: value };
    const known = this.db.prepare(`SELECT 1 FROM ${membersTable} WHERE account = ? AND chat = ? AND id = ?`).get(this.account, chat, value.id);
    this.db.prepare(`INSERT INTO ${membersTable} VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(account, chat, id) DO UPDATE SET media_group = excluded.media_group, data = excluded.data`)
      .run(this.account, chat, value.id, group, JSON.stringify(messageSchema.parse(value)));
    const [first, ...rest] = this.members(chat, group);
    const items = [first!, ...rest];
    // Album captions describe the whole album, so text precedes the items' files.
    const album: MessagingMessage = { ...first!, parts: [
      ...items.flatMap(item => item.parts.filter(part => part.kind === "text")),
      ...items.flatMap(item => item.parts.filter(part => part.kind === "file")),
    ] };
    // An earlier-numbered item arriving late becomes the album's identity; later items never stand alone.
    for (const item of rest) this.forget(chat, item.id);
    return { discovered: this.observe(conversation, album).discovered, inserted: !known, message: album };
  }
}
