import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { messagingText, type MessagingEvent, type MessagingMessage } from "@asterism-app/sdk/contracts";
import { ObservedMessages, forgetObservedConnection } from "./observed-store.ts";
import { messageObserver } from "./provider-shared.ts";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  return { db, store: new ObservedMessages(db, JSON.stringify(["connection", "slack", "bot"])) };
}
const message = (id: string, text = id, threadId?: string): MessagingMessage => ({
  id, parts: [{ kind: "text", text }], sender: { id: "person", name: "Person", role: "participant" }, sentAt: "2026-01-01T00:00:00Z",
  ...(threadId ? { threadId } : {}),
});

describe("Observed messaging events", () => {
  it("reads conversation changes independently and pages thread messages without skipping a page", () => {
    const { store } = setup(), conversation = { conversationId: "chat", title: "Chat", kind: "group" };
    const before = store.read({ conversationId: "chat", threadId: "root" }).cursor;
    store.observe({ ...conversation, threadId: "root" }, message("1", "one", "root"));
    const baseline = store.list({}).cursor;
    store.observe({ ...conversation, threadId: "other" }, message("2", "other", "other"));
    store.observe({ ...conversation, threadId: "root" }, message("3", "three", "root"));
    store.observe({ ...conversation, conversationId: "new" }, message("4"));
    const changes = store.list({ since: baseline }).conversations.map(chat => [chat.conversationId, chat.threadId, chat.change]);
    expect(changes).toEqual([["new", undefined, "discovered"], ["chat", "root", "messages"], ["chat", "other", "discovered"]]);
    expect(store.list({ since: baseline }).conversations.map(chat => [chat.conversationId, chat.threadId, chat.change])).toEqual(changes);
    const page = store.read({ conversationId: "chat", threadId: "root", since: before, limit: 1 });
    expect(page.messages.map(messagingText)).toEqual(["one"]);
    expect(page.truncated).toBe(true);
    const next = store.read({ conversationId: "chat", threadId: "root", since: page.cursor, limit: 1 });
    expect(next.messages.map(messagingText)).toEqual(["three"]);
    expect(next.truncated).toBe(false);
    expect(() => store.read({ conversationId: "chat", threadId: "other", since: page.cursor })).toThrow("cursor");
  });
  it("reads text-only persisted observations without advancing their cursor", () => {
    const { db, store } = setup(), conversation = { conversationId: "chat", title: "Chat", kind: "channel" };
    store.observe(conversation, message("1", "retained"));
    db.prepare("UPDATE messaging_messages SET data = ?").run(JSON.stringify({
      id: "1", text: "retained", sender: { id: "person", name: "Person", role: "participant" }, sentAt: "2026-01-01T00:00:00Z",
    }));
    const before = store.read({ conversationId: "chat" });
    expect(before.messages[0]?.parts).toEqual([{ kind: "text", text: "retained" }]);
    store.observe(conversation, message("1", "retained"));
    expect(store.read({ conversationId: "chat", since: before.cursor }).messages).toEqual([]);
  });
  it("does not redeliver a retried event after reopening the provider store", () => {
    const { db, store } = setup(), events: MessagingEvent[] = [];
    const value = { conversation: { conversationId: "chat", title: "Chat", kind: "channel" }, message: message("1") };
    messageObserver(store, event => events.push(event))(value);
    const cursor = store.read({ conversationId: "chat" }).cursor;
    const reopened = new ObservedMessages(db, store.account);
    messageObserver(reopened, event => events.push(event))(value);
    expect(events.map(event => event.kind)).toEqual(["conversation.discovered", "messages.received"]);
    expect(reopened.read({ conversationId: "chat", since: cursor }).messages).toEqual([]);
    expect(reopened.read({ conversationId: "chat" }).cursor).toBe(cursor);
  });
  it("retains edited content without delivering another input for the same message ID", () => {
    const { store } = setup(), events: MessagingEvent[] = [];
    const observe = messageObserver(store, event => events.push(event));
    const conversation = { conversationId: "chat", title: "Chat", kind: "channel" };
    observe({ conversation, message: message("1", "before") });
    const cursor = store.read({ conversationId: "chat" }).cursor;
    observe({ conversation, message: message("1", "after") }, false);
    expect(store.read({ conversationId: "chat", since: cursor }).messages.map(messagingText)).toEqual(["after"]);
    expect(events.filter(event => event.kind === "messages.received")).toHaveLength(1);
  });
  it("includes the root in a thread read without including sibling threads", () => {
    const { store } = setup(), conversation = { conversationId: "chat", title: "Chat", kind: "channel" };
    store.observe(conversation, message("root"));
    store.observe({ ...conversation, threadId: "root" }, message("reply", "reply", "root"));
    store.observe({ ...conversation, threadId: "other" }, message("sibling", "sibling", "other"));
    expect(store.read({ conversationId: "chat", threadId: "root" }).messages.map(value => value.id)).toEqual(["root", "reply"]);
    expect(store.read({ conversationId: "chat" }).messages.map(value => value.id)).toEqual(["root", "reply", "sibling"]);
  });
  it("looks up retained IDs in request order with current content and reports missing IDs", () => {
    const { store } = setup(), conversation = { conversationId: "chat", title: "Chat", kind: "channel" };
    store.observe(conversation, message("old", "before"));
    for (let index = 0; index < 51; index++) store.observe(conversation, message(`new-${index}`));
    store.observe(conversation, message("old", "after"));
    const cursor = store.read({ conversationId: "chat" }).cursor;
    const result = store.read({ conversationId: "chat", messageIds: ["new-50", "missing", "old", "new-50", "new-0"] });
    expect(result).toEqual({
      messages: [message("new-50"), message("old", "after"), message("new-0")],
      missingIds: ["missing"], truncated: false,
    });
    expect(store.read({ conversationId: "chat", since: cursor }).messages).toEqual([]);
  });
  it("scopes ID lookups to the account, conversation and thread, including the thread root", () => {
    const { db, store } = setup(), conversation = { conversationId: "chat", title: "Chat", kind: "channel" };
    store.observe(conversation, message("root"));
    store.observe({ ...conversation, threadId: "root" }, message("reply", "reply", "root"));
    store.observe({ ...conversation, threadId: "other" }, message("sibling", "sibling", "other"));
    store.observe({ ...conversation, conversationId: "elsewhere" }, message("other-chat"));
    new ObservedMessages(db, "other-account").observe(conversation, message("other-account"));
    expect(store.read({ conversationId: "chat", threadId: "root",
      messageIds: ["reply", "sibling", "root", "other-chat", "other-account"] })).toEqual({
      messages: [message("reply", "reply", "root"), message("root")],
      missingIds: ["sibling", "other-chat", "other-account"], truncated: false,
    });
  });
  it("resolves opaque aliases and replies after reopening without merging distinct platform messages", () => {
    const { db, store } = setup(), conversation = { conversationId: "chat", title: "Chat", kind: "group" };
    store.observe(conversation, { ...message("reply"), replyTo: "opaque-reference" });
    store.observe(conversation, message("original", "Budget"));
    store.alias("chat", "opaque-reference", "original");
    const reopened = new ObservedMessages(db, store.account);
    expect(reopened.read({ conversationId: "chat", messageIds: ["opaque-reference", "original", "reply"] })).toEqual({
      messages: [message("original", "Budget"), { ...message("reply"), replyTo: "original" }],
      missingIds: [], truncated: false,
    });
    expect(reopened.read({ conversationId: "chat" }).messages[0]?.replyTo).toBe("original");
    expect(reopened.message("another-chat", "opaque-reference")).toBeUndefined();
    expect(new ObservedMessages(db, "other-account").message("chat", "opaque-reference")).toBeUndefined();
  });
  it("removes history, aliases and provider state for every identity of only the selected connection", () => {
    const { db } = setup(), conversation = { conversationId: "chat", title: "Chat", kind: "group" };
    const removed = ["old-bot", "new-bot"].map(bot => new ObservedMessages(db, JSON.stringify(["a", "provider", bot])));
    const kept = new ObservedMessages(db, JSON.stringify(["ab", "provider", "bot"]));
    for (const store of [...removed, kept]) {
      store.observe(conversation, message("1"));
      store.alias("chat", "reference", "1");
      store.setState("receiver", { offset: 42 });
    }
    expect(new ObservedMessages(db, kept.account).state("receiver")).toEqual({ offset: 42 });
    expect(new ObservedMessages(db, JSON.stringify(["ab", "provider", "other-bot"])).state("receiver")).toBeUndefined();
    forgetObservedConnection(db, "a");
    for (const store of removed) {
      const reopened = new ObservedMessages(db, store.account);
      expect(reopened.list({}).conversations).toEqual([]);
      expect(reopened.message("chat", "1")).toBeUndefined();
      expect(reopened.resolveId("chat", "reference")).toBe("reference");
      expect(reopened.state("receiver")).toBeUndefined();
    }
    expect(kept.message("chat", "reference")?.id).toBe("1");
    expect(kept.state("receiver")).toEqual({ offset: 42 });
  });
});
