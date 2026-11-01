import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { MessagingMessage } from "@asterism-app/sdk/contracts";
import { TelegramStore, forgetTelegramConnection, telegramAccount } from "./telegram-store.ts";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  return { db, store: new TelegramStore(db, "connection/bot") };
}
const message = (id: string, text = id, threadId?: string): MessagingMessage => ({
  id, text, sender: { id: "person", name: "Person", role: "participant" }, sentAt: "2026-01-01T00:00:00Z",
  ...(threadId ? { threadId } : {}),
});

describe("Telegram observed history", () => {
  it("distinguishes discovered conversations from later messages without consuming either reader's cursor", () => {
    const { store } = setup();
    store.record({ conversationId: "a", title: "A", kind: "private" }, message("1"));
    const baseline = store.list({}).cursor;
    store.record({ conversationId: "a", title: "A", kind: "private" }, message("2"));
    store.record({ conversationId: "b", title: "B", kind: "group" }, message("3"));
    const query = { since: baseline };
    expect(store.list(query).conversations.map(chat => [chat.conversationId, chat.change]))
      .toEqual([["b", "discovered"], ["a", "messages"]]);
    // Another reader does not advance this reader's baseline.
    store.list({});
    expect(store.list(query).conversations.map(chat => chat.conversationId)).toEqual(["b", "a"]);
  });

  it("continues new messages without skipping a page and keeps topic queries separate", () => {
    const { store } = setup();
    const chat = { conversationId: "group", title: "Group", kind: "supergroup" };
    const baseline = store.read({ conversationId: "group", threadId: "10" }).cursor;
    store.record({ ...chat, threadId: "10" }, message("1", "one", "10"));
    store.record({ ...chat, threadId: "20" }, message("2", "other topic", "20"));
    store.record({ ...chat, threadId: "10" }, message("3", "three", "10"));
    const page = store.read({ conversationId: "group", threadId: "10", since: baseline, limit: 1 });
    expect(page.messages.map(message => message.text)).toEqual(["one"]);
    expect(page.truncated).toBe(true);
    const next = store.read({ conversationId: "group", threadId: "10", since: page.cursor, limit: 1 });
    expect(next.messages.map(message => message.text)).toEqual(["three"]);
    expect(next.truncated).toBe(false);
    expect(() => store.read({ conversationId: "group", threadId: "20", since: page.cursor })).toThrow("cursor");
  });

  it("reuses stored state after reconnect and isolates replacement bot identities", () => {
    const { db, store } = setup();
    store.record({ conversationId: "a", title: "A", kind: "private" }, message("1"));
    store.advance(42);
    const cursor = store.list({}).cursor;
    const reopened = new TelegramStore(db, "connection/bot");
    expect(reopened.offset()).toBe(42);
    expect(reopened.read({ conversationId: "a" }).messages.map(message => message.id)).toEqual(["1"]);
    const replacement = new TelegramStore(db, "connection/other-bot");
    expect(replacement.list({}).conversations).toEqual([]);
    expect(() => replacement.list({ since: cursor })).toThrow("cursor");
  });

  it("updates an edited message without duplicating it and exposes its changed content after a prior cursor", () => {
    const { store } = setup(), chat = { conversationId: "a", title: "A", kind: "private" };
    store.record(chat, message("1", "before"));
    const before = store.read({ conversationId: "a" }).cursor;
    expect(store.record(chat, message("1", "after"))).toBe(false);
    expect(store.read({ conversationId: "a", since: before }).messages.map(message => message.text)).toEqual(["after"]);
    expect(store.read({ conversationId: "a" }).messages).toHaveLength(1);
  });
  // Connection IDs that share a prefix must not lose each other's history when one is removed.
  it("forgets every bot identity of a removed connection and keeps other connections", () => {
    const { db } = setup(), chat = { conversationId: "a", title: "A", kind: "private" };
    const removed = [new TelegramStore(db, telegramAccount("a", 1)), new TelegramStore(db, telegramAccount("a", 2))];
    const kept = new TelegramStore(db, telegramAccount("ab", 1));
    for (const store of [...removed, kept]) { store.record(chat, message("1")); store.advance(7); }
    forgetTelegramConnection(db, "a");
    for (const account of [telegramAccount("a", 1), telegramAccount("a", 2)]) {
      const reopened = new TelegramStore(db, account);
      expect(reopened.offset()).toBe(0);
      expect(reopened.list({}).conversations).toEqual([]);
    }
    expect(kept.offset()).toBe(7);
    expect(kept.read({ conversationId: "a" }).messages.map(message => message.id)).toEqual(["1"]);
  });
});
