import type { MessagingMessage } from "@asterism-app/sdk/contracts";

export interface TimelineGroup<T extends MessagingMessage = MessagingMessage> { day: string; sender: MessagingMessage["sender"]; messages: T[] }

/** Local calendar day of an ISO timestamp, used to separate days in a timeline. */
export function localDay(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Consecutive messages from one sender on one local day form a group; a day change or another sender starts a new one. */
export function groupTimeline<T extends MessagingMessage>(messages: readonly T[]): TimelineGroup<T>[] {
  const groups: TimelineGroup<T>[] = [];
  for (const message of messages) {
    const day = localDay(message.sentAt), last = groups.at(-1);
    if (last && last.day === day && last.sender.id === message.sender.id && last.sender.role === message.sender.role) last.messages.push(message);
    else groups.push({ day, sender: message.sender, messages: [message] });
  }
  return groups;
}

export type ChatEntry<T extends MessagingMessage = MessagingMessage> =
  | { kind: "day"; key: string; sentAt: string }
  | { kind: "system"; message: T }
  | { kind: "message"; message: T; first: boolean };

/** Day markers and sender-group boundaries are real virtual rows, so navigation uses this projected order. */
export function chatEntries<T extends MessagingMessage>(items: readonly T[]): ChatEntry<T>[] {
  return groupTimeline(items).flatMap((group, index, groups) => [
    ...(groups[index - 1]?.day === group.day ? [] : [{ kind: "day" as const, key: `day:${group.day}`, sentAt: group.messages[0]!.sentAt }]),
    ...group.messages.map((message, position): ChatEntry<T> => group.sender.role === "system"
      ? { kind: "system", message } : { kind: "message", message, first: position === 0 }),
  ]);
}

/** Message ids and calendar markers occupy different key namespaces. */
export function chatEntryKey(entry: ChatEntry): string {
  return entry.kind === "day" ? entry.key : `message:${entry.message.id}`;
}

/** Rolling pages can move a retained message without changing the row count; height corrections remain with virtua. */
export function chatReadingAnchorIndex(previous: readonly ChatEntry[], next: readonly ChatEntry[], messageId: string): number | null {
  const matches = (entry: ChatEntry) => entry.kind !== "day" && entry.message.id === messageId;
  const before = previous.findIndex(matches), after = next.findIndex(matches);
  return before < 0 || after < 0 || before === after ? null : after;
}

const units: readonly [Intl.RelativeTimeFormatUnit, number][] = [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60]];
/** Largest whole unit between two instants; under a minute is reported as zero seconds ("now"). */
export function relativeUnit(from: number, now: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const seconds = Math.round((from - now) / 1000);
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return { value: Math.trunc(seconds / size), unit };
  return { value: 0, unit: "second" };
}
