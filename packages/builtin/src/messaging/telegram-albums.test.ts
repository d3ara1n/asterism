import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { MessagingMessage } from "@asterism-app/sdk/contracts";
import { ObservedMessages } from "./observed-store.ts";
import { TelegramAlbums } from "./telegram-albums.ts";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const chat = { conversationId: "chat", title: "Chat", kind: "group" };
const item = (id: string, groupId: string, file = `file-${id}`): MessagingMessage => ({
  id, groupId, sender: { id: "person", name: "Person", role: "participant" }, sentAt: "2026-01-01T00:00:00Z",
  parts: [{ kind: "file", id: file, mediaType: "image/jpeg" }],
});
function setup() {
  const db = new DatabaseSync(":memory:"); databases.push(db);
  const store = new ObservedMessages(db, JSON.stringify(["connection", "telegram", "bot"]));
  return { store, batches: new TelegramAlbums(store) };
}

describe("Telegram album delivery", () => {
  it("delivers an album in platform order as one batch while each member remains individually readable", () => {
    const { store, batches } = setup();
    store.observe(chat, item("11", "album"));
    const active = batches.touch(chat, "album");
    store.observe(chat, item("10", "album"));
    batches.touch(chat, "album");
    expect(batches.flush(new Set([active]))).toEqual([]);
    expect(batches.flush(new Set())).toEqual([{ kind: "messages.received", conversation: chat,
      messages: [item("10", "album"), item("11", "album")] }]);
    expect(batches.flush(new Set())).toEqual([]);
    expect(store.read({ conversationId: "chat", messageIds: ["11", "10"] }).messages).toEqual([item("11", "album"), item("10", "album")]);
  });
  it("closes inactive groups independently and reads current members without crossing chats or threads", () => {
    const { store, batches } = setup(), topic = { ...chat, threadId: "topic" };
    store.observe(topic, { ...item("1", "same-group"), threadId: "topic" });
    const active = batches.touch(topic, "same-group");
    const other = { ...chat, conversationId: "other" };
    store.observe(other, item("2", "same-group"));
    batches.touch(other, "same-group");
    store.observe({ ...chat, threadId: "sibling" }, { ...item("3", "same-group"), threadId: "sibling" });
    expect(batches.flush(new Set([active]))).toEqual([{ kind: "messages.received", conversation: other, messages: [item("2", "same-group")] }]);
    store.observe(topic, { ...item("1", "same-group", "edited"), threadId: "topic" });
    expect(batches.flush(new Set())).toEqual([{ kind: "messages.received", conversation: topic,
      messages: [{ ...item("1", "same-group", "edited"), threadId: "topic" }] }]);
  });
});
