import type { DatabaseSync } from "node:sqlite";

/** Shared provider-owned messaging storage; provider state is opaque JSON. */
export function ensureMessagingSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messaging_accounts (
      account TEXT PRIMARY KEY, sequence INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messaging_dialogs (
      account TEXT NOT NULL, chat TEXT NOT NULL, thread TEXT NOT NULL,
      data TEXT NOT NULL, discovered INTEGER NOT NULL, sequence INTEGER NOT NULL,
      PRIMARY KEY (account, chat, thread)
    );
    CREATE TABLE IF NOT EXISTS messaging_messages (
      account TEXT NOT NULL, chat TEXT NOT NULL, id TEXT NOT NULL, thread TEXT NOT NULL,
      data TEXT NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY (account, chat, id)
    );
    CREATE INDEX IF NOT EXISTS messaging_message_groups ON messaging_messages(account, chat, json_extract(data, '$.groupId'));
    CREATE TABLE IF NOT EXISTS messaging_provider_state (
      account TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY (account, key)
    );
    CREATE TABLE IF NOT EXISTS messaging_message_aliases (
      account TEXT NOT NULL, chat TEXT NOT NULL, alias TEXT NOT NULL, message_id TEXT NOT NULL,
      PRIMARY KEY (account, chat, alias)
    );
    CREATE TABLE IF NOT EXISTS messaging_file_aliases (
      account TEXT NOT NULL, chat TEXT NOT NULL, message_id TEXT NOT NULL, file_id TEXT NOT NULL, target_id TEXT NOT NULL,
      PRIMARY KEY (account, chat, message_id, file_id)
    );
    CREATE TABLE IF NOT EXISTS messaging_cursor_scopes (
      account TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, max_sequence INTEGER NOT NULL, shifts TEXT NOT NULL,
      PRIMARY KEY (account, source)
    );
  `);
}
