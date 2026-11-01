import { describe, expect, it } from "vitest";
import type { ConnectionEvent, SessionRecord } from "@asterism-app/sdk/contracts";
import { Chat, Conversations, SubscriptionChanged, type SubscriptionTarget } from "./contract.ts";
import { foldSubscriptions, matchesSubscription, selectDeliveries } from "./subscriptions.ts";

function record(sequence: number, target: SubscriptionTarget, enabled: boolean): SessionRecord {
  return { id: String(sequence), sessionId: "session", parentId: sequence > 1 ? String(sequence - 1) : null,
    sequence, createdAt: "2026-01-01T00:00:00Z", contract: { id: SubscriptionChanged.id },
    source: { plugin: "asterism.builtin", resource: { sessionId: "session", id: "list", kind: "conversations" } },
    context: null, data: { target, enabled } };
}
describe("Messaging subscription projection", () => {
  it("restores the selected path rather than retaining a subscription from a discarded future", () => {
    const connection = { connectionId: "bot" }, chat = { connectionId: "bot", conversationId: "group" };
    const prefix = [record(1, connection, true), record(2, chat, true)];
    expect(foldSubscriptions([...prefix, record(3, connection, false)])).toEqual([chat]);
    expect(foldSubscriptions(prefix)).toEqual([connection, chat]);
    expect(foldSubscriptions([prefix[0]!, record(4, chat, false)])).toEqual([connection]);
    expect(foldSubscriptions([])).toEqual([]);
  });
  it("connection discovery does not subscribe to every message; a topic subscription only matches that topic", () => {
    const conversation = { conversationId: "group", threadId: "topic", title: "Group", kind: "supergroup" };
    const discovered: ConnectionEvent = { connectionId: "bot", event: { kind: "conversation.discovered", conversation } };
    const incoming: ConnectionEvent = { connectionId: "bot", event: { kind: "message.received", conversation,
      message: { id: "1", sender: { id: "user", name: "User", role: "participant" }, text: "Hello", sentAt: "2026-01-01T00:00:00Z" } } };
    expect(matchesSubscription({ connectionId: "bot" }, discovered)).toBe(true);
    expect(matchesSubscription({ connectionId: "bot" }, incoming)).toBe(false);
    expect(matchesSubscription({ connectionId: "bot", conversationId: "group" }, incoming)).toBe(true);
    expect(matchesSubscription({ connectionId: "bot", conversationId: "group", threadId: "other" }, incoming)).toBe(false);
    expect(matchesSubscription({ connectionId: "another", conversationId: "group" }, incoming)).toBe(false);
  });
  // An Agent exposed to both a Conversations list and a Chat for the same conversation must not receive the event twice.
  it("delivers once per recipient and prefers a Chat over a Conversations summary", () => {
    const ref = (id: string, kind: string) => ({ sessionId: "session", id, kind });
    const agent = ref("agent", "agent"), other = ref("other", "agent");
    const list = ref("list", Conversations.kind), chat = ref("chat", Chat.kind), second = ref("chat-2", Chat.kind);
    const deliveries = selectDeliveries([
      { source: list, title: "List", recipient: agent },
      { source: chat, title: "Chat", recipient: agent },
      { source: second, title: "Second", recipient: agent },
      { source: list, title: "List", recipient: other },
    ]);
    expect(deliveries.map(item => [item.recipient.id, item.source.id])).toEqual([["agent", "chat"], ["other", "list"]]);
  });
  // An Agent exposed to both a Chat and a Conversations subscription for the same conversation must not receive the event twice.
  it("delivers one event to each recipient once, preferring a Chat over a Conversations summary", () => {
    const ref = (id: string, kind: string) => ({ sessionId: "session", id, kind });
    const agent = ref("agent", "agent"), other = ref("other", "agent");
    const list = ref("list", Conversations.kind), chat = ref("chat", Chat.kind), second = ref("chat-2", Chat.kind);
    const deliveries = selectDeliveries([
      { source: list, title: "List", recipient: agent },
      { source: chat, title: "Chat", recipient: agent },
      { source: second, title: "Second", recipient: agent },
      { source: list, title: "List", recipient: other },
    ]);
    expect(deliveries.map(item => [item.recipient.id, item.source.id])).toEqual([["agent", "chat"], ["other", "list"]]);
  });
});

describe("Messaging delivery selection", () => {
  const agent = { sessionId: "s", id: "agent", kind: "agent" };
  const list = { sessionId: "s", id: "list", kind: Conversations.kind };
  const chatA = { sessionId: "s", id: "chat-a", kind: Chat.kind }, chatB = { sessionId: "s", id: "chat-b", kind: Chat.kind };
  it("delivers one event once per recipient and prefers a Chat's full message over a list summary", () => {
    const selected = selectDeliveries([
      { source: list, title: "List", recipient: agent },
      { source: chatA, title: "A", recipient: agent },
      { source: chatB, title: "B", recipient: agent },
    ]);
    expect(selected.map(delivery => delivery.source.id)).toEqual(["chat-a"]);
  });
  it("keeps separate recipients, including same-named Agents in different sessions", () => {
    const other = { ...agent, sessionId: "t" };
    expect(selectDeliveries([{ source: list, title: "List", recipient: agent }, { source: list, title: "List", recipient: other }])).toHaveLength(2);
  });
});

describe("Messaging event delivery", () => {
  const agent = { sessionId: "s", id: "agent", kind: "agent" };
  const chat = (id: string) => ({ sessionId: "s", id, kind: Chat.kind });
  const list = { sessionId: "s", id: "list", kind: Conversations.kind };
  it("delivers one event once per recipient and prefers a Chat's full message over a list summary", () => {
    const deliveries = selectDeliveries([
      { source: list, title: "List", recipient: agent },
      { source: chat("a"), title: "A", recipient: agent },
      { source: chat("b"), title: "B", recipient: agent },
      { source: list, title: "List", recipient: { ...agent, id: "other" } },
    ]);
    expect(deliveries.map(item => [item.recipient.id, item.source.id])).toEqual([["agent", "a"], ["other", "list"]]);
  });
});
