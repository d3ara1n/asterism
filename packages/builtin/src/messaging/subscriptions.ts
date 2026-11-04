import type { ConnectionEvent, ConversationAddress, SessionRecord } from "@asterism-app/sdk/contracts";
import { SubscriptionChanged, type SubscriptionTarget } from "./contract.ts";

export function subscriptionKey(target: SubscriptionTarget): string {
  return JSON.stringify([target.connectionId, target.conversationId ?? null, target.threadId ?? null]);
}
export function foldSubscriptions(records: readonly SessionRecord[]): SubscriptionTarget[] {
  const selected = new Map<string, SubscriptionTarget>();
  for (const decoded of SubscriptionChanged.decodeAll(records)) {
    if (decoded.status === "unknown") throw new Error("Invalid messaging subscription record.");
    const { target, enabled } = decoded.data, key = subscriptionKey(target);
    if (enabled) selected.set(key, target); else selected.delete(key);
  }
  return [...selected.values()];
}
/** A conversation target covers all of its topics unless it names one. */
export function coversAddress(target: SubscriptionTarget, connectionId: string, address: ConversationAddress): boolean {
  return target.connectionId === connectionId && target.conversationId === address.conversationId &&
    (!target.threadId || target.threadId === address.threadId);
}
export function matchesSubscription(target: SubscriptionTarget, { connectionId, event }: ConnectionEvent): boolean {
  if (target.connectionId !== connectionId) return false;
  if (!target.conversationId) return event.kind === "conversation.discovered";
  return event.kind === "messages.received" && coversAddress(target, connectionId, event.conversation);
}
