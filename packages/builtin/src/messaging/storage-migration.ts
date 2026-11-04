import type { DatabaseSync } from "node:sqlite";
import type { MessagingMessage } from "@asterism-app/sdk/contracts";
import { ensureMessagingSchema } from "./storage-schema.ts";
import { translateSequence, type SequenceShift } from "./cursor.ts";

interface LegacyMessage { chat: string; id: string; thread: string; data: string; sequence: number }
type LegacyStoredMessage = Omit<MessagingMessage, "parts"> & { parts?: MessagingMessage["parts"]; text?: string };

/** Move Telegram observations into shared storage and recover native messages from retained album members. */
export function migrateMessagingV1(db: DatabaseSync): void {
  ensureMessagingSchema(db);
  const hasTable = (name: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  if (!hasTable("telegram_accounts")) return;
  const hasMembers = hasTable("telegram_group_members");
  const accounts = db.prepare("SELECT account, offset, sequence FROM telegram_accounts").all() as { account: string; offset: number; sequence: number }[];
  const insertMessage = db.prepare("INSERT INTO messaging_messages VALUES (?, ?, ?, ?, ?, ?)");
  const insertConversation = db.prepare("INSERT INTO messaging_dialogs VALUES (?, ?, ?, ?, ?, ?)");
  const insertFileAlias = db.prepare("INSERT OR IGNORE INTO messaging_file_aliases VALUES (?, ?, ?, ?, ?)");
  const insertCursorScope = db.prepare("INSERT INTO messaging_cursor_scopes VALUES (?, ?, ?, ?, ?)");
  const findMember = hasMembers ? db.prepare("SELECT media_group FROM telegram_group_members WHERE account = ? AND chat = ? AND id = ?") : undefined;
  const readMembers = hasMembers ? db.prepare(`SELECT data FROM telegram_group_members
    WHERE account = ? AND chat = ? AND media_group = ? ORDER BY CAST(id AS INTEGER)`) : undefined;
  for (const account of accounts) {
    const [connectionId, botId] = JSON.parse(account.account) as [string, number];
    const key = JSON.stringify([connectionId, "telegram", String(botId)]);
    const rows = db.prepare("SELECT chat, id, thread, data, sequence FROM telegram_messages WHERE account = ? ORDER BY sequence")
      .all(account.account) as unknown as LegacyMessage[];
    let shift = 0;
    const shifts: SequenceShift[] = [];
    const expanded = rows.map(row => {
      const member = findMember?.get(account.account, row.chat, row.id) as { media_group: string } | undefined;
      const items: LegacyStoredMessage[] = member ? (readMembers!.all(account.account, row.chat, member.media_group) as { data: string }[])
        .map(item => ({ ...JSON.parse(item.data) as LegacyStoredMessage, groupId: member.media_group }))
        : [JSON.parse(row.data) as LegacyStoredMessage];
      const sequence = row.sequence + shift;
      if (items.length > 1) {
        shift += items.length - 1;
        shifts.push({ sequence: row.sequence, total: shift });
      }
      return { row, items, sequence };
    });
    // Opening space for each recovered member keeps sequence cursors unique and preserves observation order.
    const sequenceAt = (sequence: number, end: boolean) => translateSequence(sequence, shifts, end);
    db.prepare("INSERT INTO messaging_accounts VALUES (?, ?)").run(key, sequenceAt(account.sequence, true));
    db.prepare("INSERT INTO messaging_provider_state VALUES (?, ?, ?)").run(key, "receiver", JSON.stringify({ offset: account.offset }));
    for (const { row, items, sequence } of expanded) {
      for (const [index, item] of items.entries()) {
        insertMessage.run(key, row.chat, item.id, item.threadId ?? row.thread, JSON.stringify(item), sequence + index);
        // A higher-numbered member could have been the old album head before an earlier item arrived.
        for (const source of items.slice(0, index)) for (const part of item.parts ?? []) {
          // Repeated file IDs retain the first owner, matching the old album's attachment lookup.
          if (part.kind === "file") insertFileAlias.run(key, row.chat, source.id, part.id, item.id);
        }
      }
    }
    const conversations = db.prepare("SELECT chat, thread, data, discovered, sequence FROM telegram_dialogs WHERE account = ?")
      .all(account.account) as { chat: string; thread: string; data: string; discovered: number; sequence: number }[];
    for (const conversation of conversations) insertConversation.run(key, conversation.chat, conversation.thread, conversation.data,
      sequenceAt(conversation.discovered, false), sequenceAt(conversation.sequence, true));
    insertCursorScope.run(key, `${account.account}/dialogs`, `${key}/dialogs`, account.sequence, JSON.stringify(shifts));
    const addresses = new Set(conversations.flatMap(conversation => [
      JSON.stringify([conversation.chat, null]), JSON.stringify([conversation.chat, conversation.thread || null]),
    ]));
    for (const address of addresses) {
      const [chat, thread] = JSON.parse(address) as [string, string | null];
      insertCursorScope.run(key, JSON.stringify([account.account, chat, thread]), JSON.stringify([key, chat, thread]), account.sequence, JSON.stringify(shifts));
    }
  }
  db.exec("DROP TABLE IF EXISTS telegram_group_members; DROP TABLE telegram_messages; DROP TABLE telegram_dialogs; DROP TABLE telegram_accounts;");
}
