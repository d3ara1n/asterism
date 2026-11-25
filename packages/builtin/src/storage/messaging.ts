import type { DatabaseSync } from "node:sqlite";
import type { Json } from "@asterism-app/sdk/contracts";
import type { PluginStorageDeclaration } from "@asterism-app/sdk/runtime";

/** Schema introduced by database format 2, independent of current table initialization. */
function migrateDatabase1(db: DatabaseSync): void {
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
  `);
}

/** Convert saved observations without changing row keys, delivery cursors, or provider state. */
function migrateDatabase2(db: DatabaseSync): void {
  // Another feature can open this database without ever initializing the messaging tables.
  if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'messaging_messages'").get()) return;
  db.exec(`UPDATE messaging_messages
    SET data = json_set(json_remove(data, '$.text'), '$.parts', json_array(json_object('kind', 'text', 'text', json_extract(data, '$.text'))))
    WHERE CASE WHEN json_valid(data)
      THEN json_type(data, '$.parts') IS NULL AND json_type(data, '$.text') = 'text'
      ELSE 0 END;`);
}

export const messagingDatabaseStorage = {
  kind: "sqlite", path: ".asterism/db.sqlite", version: 3,
  migrations: { 1: migrateDatabase1, 2: migrateDatabase2 },
} satisfies PluginStorageDeclaration;

function migrateSentMessage(_contract: string, data: Json): Json {
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.hasOwn(data, "parts") || typeof data.text !== "string") return data;
  const { text, ...rest } = data;
  return { ...rest, parts: [{ kind: "text", text }] };
}

export const messagingHistoryStorage = {
  kind: "records", id: "messaging-sent", contracts: ["asterism.builtin/chat.message-sent"], version: 2,
  migrations: { 1: migrateSentMessage },
} satisfies PluginStorageDeclaration;
