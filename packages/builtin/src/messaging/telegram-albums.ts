import type { MessagingConversation, MessagingEvent } from "@asterism-app/sdk/contracts";
import type { ObservedMessages } from "./observed-store.ts";

/** Telegram supplies no album-complete marker; a poll without new items closes a pending batch. */
export class TelegramAlbums {
  private readonly pending = new Map<string, { conversation: MessagingConversation; groupId: string }>();
  constructor(private readonly store: ObservedMessages) {}
  get size(): number { return this.pending.size; }
  touch(conversation: MessagingConversation, groupId: string): string {
    const key = JSON.stringify([conversation.conversationId, conversation.threadId ?? null, groupId]);
    this.pending.set(key, { conversation, groupId });
    return key;
  }
  flush(active: ReadonlySet<string>): MessagingEvent[] {
    const events: MessagingEvent[] = [];
    for (const [key, { conversation, groupId }] of this.pending) {
      if (active.has(key)) continue;
      this.pending.delete(key);
      // Message IDs are numeric in Telegram and order the items within an album.
      const messages = this.store.group(conversation, groupId).sort((left, right) => Number(left.id) - Number(right.id));
      if (messages.length) events.push({ kind: "messages.received", conversation, messages });
    }
    return events;
  }
}
