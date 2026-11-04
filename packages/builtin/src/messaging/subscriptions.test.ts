import { describe, expect, it } from "vitest";
import type { ConnectionEvent, SessionRecord } from "@asterism-app/sdk/contracts";
import { SubscriptionChanged, type SubscriptionTarget } from "./contract.ts";
import { foldSubscriptions, matchesSubscription } from "./subscriptions.ts";

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
    const incoming: ConnectionEvent = { connectionId: "bot", event: { kind: "messages.received", conversation,
      messages: [{ id: "1", sender: { id: "user", name: "User", role: "participant" }, parts: [{ kind: "text", text: "Hello" }], sentAt: "2026-01-01T00:00:00Z" }] } };
    expect(matchesSubscription({ connectionId: "bot" }, discovered)).toBe(true);
    expect(matchesSubscription({ connectionId: "bot" }, incoming)).toBe(false);
    expect(matchesSubscription({ connectionId: "bot", conversationId: "group" }, incoming)).toBe(true);
    expect(matchesSubscription({ connectionId: "bot", conversationId: "group", threadId: "other" }, incoming)).toBe(false);
    expect(matchesSubscription({ connectionId: "another", conversationId: "group" }, incoming)).toBe(false);
  });
});
