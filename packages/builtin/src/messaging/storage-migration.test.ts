import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { MessagingMessage } from "@asterism-app/sdk/contracts";
import { migrateMessagingV1 } from "./storage-migration.ts";
import { ObservedMessages } from "./observed-store.ts";
import { encodeObservedCursor } from "./cursor.ts";
import { observedFile } from "./provider-shared.ts";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function database() { const db = new DatabaseSync(":memory:"); databases.push(db); return db; }
const chat = { conversationId: "chat", title: "Chat", kind: "group" };
const message = (id: string): MessagingMessage => ({ id, sender: { id: "person", name: "Person", role: "participant" },
  sentAt: "2026-01-01T00:00:00Z", parts: [{ kind: "text", text: id }] });
function legacy(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE telegram_accounts (account TEXT PRIMARY KEY, offset INTEGER NOT NULL, sequence INTEGER NOT NULL);
    CREATE TABLE telegram_dialogs (account TEXT NOT NULL, chat TEXT NOT NULL, thread TEXT NOT NULL,
      data TEXT NOT NULL, discovered INTEGER NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY(account, chat, thread));
    CREATE TABLE telegram_messages (account TEXT NOT NULL, chat TEXT NOT NULL, id TEXT NOT NULL, thread TEXT NOT NULL,
      data TEXT NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY(account, chat, id));
  `);
}

describe("Messaging storage migration", () => {
  it("recovers native album members and preserves pagination, captions, references and receiver progress", () => {
    const db = database(); legacy(db);
    db.exec(`CREATE TABLE telegram_group_members (account TEXT NOT NULL, chat TEXT NOT NULL, id TEXT NOT NULL,
      media_group TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(account, chat, id));`);
    const old = JSON.stringify(["connection", 7]);
    db.prepare("INSERT INTO telegram_accounts VALUES (?, ?, ?)").run(old, 42, 6);
    db.prepare("INSERT INTO telegram_dialogs VALUES (?, ?, ?, ?, ?, ?)").run(old, "chat", "", JSON.stringify(chat), 1, 6);
    const insert = (value: MessagingMessage, sequence: number) => db.prepare("INSERT INTO telegram_messages VALUES (?, ?, ?, ?, ?, ?)")
      .run(old, "chat", value.id, "", JSON.stringify(value), sequence);
    insert(message("1"), 1);
    const groups = [["10", "11"], ["20", "21", "22", "23"]];
    for (const [index, ids] of groups.entries()) {
      const members: MessagingMessage[] = ids.map(id => ({ ...message(id),
        parts: [{ kind: "file", id: id === "22" || id === "23" ? "shared-image" : `image-${id}`, mediaType: "image/jpeg" }] }));
      members[0]!.parts.unshift({ kind: "text", text: "Caption" });
      for (const item of members) db.prepare("INSERT INTO telegram_group_members VALUES (?, ?, ?, ?, ?)")
        .run(old, "chat", item.id, `album-${index}`, JSON.stringify(item));
      insert({ ...members[0]!, parts: members.flatMap(item => item.parts) }, 3 + index);
    }
    insert({ ...message("30"), replyTo: "10" }, 6);
    const oldCursor = Buffer.from(JSON.stringify([JSON.stringify([old, "chat", null]), 3])).toString("base64url");
    const oldEndCursor = Buffer.from(JSON.stringify([JSON.stringify([old, "chat", null]), 6])).toString("base64url");
    const oldListCursor = Buffer.from(JSON.stringify([`${old}/dialogs`, 3])).toString("base64url");
    migrateMessagingV1(db);
    const account = JSON.stringify(["connection", "telegram", "7"]), store = new ObservedMessages(db, account);
    expect(store.state("receiver")).toEqual({ offset: 42 });
    let cursor = encodeObservedCursor(JSON.stringify([account, "chat", null]), 0);
    const ids: string[] = [];
    for (let index = 0; index < 8; index++) {
      const page = store.read({ conversationId: "chat", since: cursor, limit: 1 });
      ids.push(...page.messages.map(item => item.id));
      cursor = page.cursor!;
      expect(page.truncated).toBe(index < 7);
    }
    expect(ids).toEqual(["1", "10", "11", "20", "21", "22", "23", "30"]);
    expect(store.message("chat", "10")?.parts).toEqual([{ kind: "text", text: "Caption" }, { kind: "file", id: "image-10", mediaType: "image/jpeg" }]);
    expect(store.message("chat", "11")).toMatchObject({ id: "11", groupId: "album-0", parts: [{ kind: "file", id: "image-11" }] });
    expect(store.message("chat", "30")?.replyTo).toBe("10");
    expect(observedFile(store, { conversationId: "chat", messageId: "10", fileId: "image-11" }).message.id).toBe("11");
    expect(observedFile(store, { conversationId: "chat", messageId: "21", fileId: "shared-image" }).message.id).toBe("22");
    expect(store.message("chat", "23")?.parts).toEqual([{ kind: "file", id: "shared-image", mediaType: "image/jpeg" }]);
    expect(store.read({ conversationId: "chat", since: oldCursor }).messages.map(item => item.id)).toEqual(["20", "21", "22", "23", "30"]);
    expect(store.read({ conversationId: "chat", since: oldEndCursor }).messages).toEqual([]);
    expect(store.list({ since: oldListCursor }).conversations).toEqual([{ ...chat, change: "messages" }]);
    expect(() => store.read({ conversationId: "another-chat", since: oldCursor })).toThrow("cursor");
    expect(store.list({}).conversations).toEqual([chat]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'telegram_%'").all()).toEqual([]);
  });
  it("moves early text-only Telegram history without an album table and leaves other providers intact", () => {
    const db = database(), other = new ObservedMessages(db, JSON.stringify(["connection", "discord", "bot"]));
    other.observe(chat, message("discord"));
    const before = other.read({ conversationId: "chat" });
    legacy(db);
    const old = JSON.stringify(["connection", 9]);
    db.prepare("INSERT INTO telegram_accounts VALUES (?, ?, ?)").run(old, 10, 1);
    db.prepare("INSERT INTO telegram_dialogs VALUES (?, ?, ?, ?, ?, ?)").run(old, "chat", "", JSON.stringify(chat), 1, 1);
    const { parts: _parts, ...rest } = message("telegram");
    db.prepare("INSERT INTO telegram_messages VALUES (?, ?, ?, ?, ?, ?)").run(old, "chat", "telegram", "", JSON.stringify({ ...rest, text: "Retained" }), 1);
    migrateMessagingV1(db);
    expect(other.read({ conversationId: "chat" })).toEqual(before);
    const store = new ObservedMessages(db, JSON.stringify(["connection", "telegram", "9"]));
    expect(store.message("chat", "telegram")?.parts).toEqual([{ kind: "text", text: "Retained" }]);
    expect(store.state("receiver")).toEqual({ offset: 10 });
  });
  it("upgrades a database without Telegram observations without changing existing message positions", () => {
    const db = database(), store = new ObservedMessages(db, JSON.stringify(["connection", "qq", "app"]));
    store.observe(chat, message("1"));
    const before = store.read({ conversationId: "chat" });
    migrateMessagingV1(db);
    expect(store.read({ conversationId: "chat" })).toEqual(before);
  });
});
