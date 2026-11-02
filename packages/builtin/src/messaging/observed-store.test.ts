import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { messagingText, type MessagingEvent, type MessagingMessage } from "@asterism-app/sdk/contracts";
import { ObservedMessages } from "./observed-store.ts";
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
    expect(events.map(event => event.kind)).toEqual(["conversation.discovered", "message.received"]);
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
    expect(events.filter(event => event.kind === "message.received")).toHaveLength(1);
  });
  it("includes the root in a thread read without including sibling threads", () => {
    const { store } = setup(), conversation = { conversationId: "chat", title: "Chat", kind: "channel" };
    store.observe(conversation, message("root"));
    store.observe({ ...conversation, threadId: "root" }, message("reply", "reply", "root"));
    store.observe({ ...conversation, threadId: "other" }, message("sibling", "sibling", "other"));
    expect(store.read({ conversationId: "chat", threadId: "root" }).messages.map(value => value.id)).toEqual(["root", "reply"]);
    expect(store.read({ conversationId: "chat" }).messages.map(value => value.id)).toEqual(["root", "reply", "sibling"]);
  });
});
