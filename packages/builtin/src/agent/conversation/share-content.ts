import { displayInputParts, inputFileName, type AgentMessageSender } from "@asterism-app/builtin-api/contracts";
import type { TimelineItem } from "./timeline";

export interface ShareMessage {
  id: string;
  turnId: string;
  /** Null marks the Agent's own final reply. */
  sender: AgentMessageSender | null;
  createdAt: string | null;
  markdown: string;
  attachments: string[];
}

/** Only saved inputs and final replies participate; process output and live blocks never become share content. */
export function shareMessages(items: readonly TimelineItem[]): ShareMessage[] {
  let turnId = "";
  let turnStart = 0;
  const messages: ShareMessage[] = [];
  for (const item of items) {
    if (item.kind === "message") {
      if (item.startsTurn || !turnId) { turnId = item.id; turnStart = messages.length; }
      const parts = displayInputParts(item);
      const markdown = parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n\n");
      const attachments = parts.flatMap(part => part.kind === "text" ? [] : [inputFileName(part)]);
      if (markdown.trim() || attachments.length) messages.push({ id: item.id, turnId, sender: item.sender, createdAt: item.createdAt, markdown, attachments });
    } else if (item.kind === "turn-metrics") {
      // The reading window may begin with a steer input after the original turn start.
      for (let index = turnStart; index < messages.length; index++) messages[index]!.turnId = item.inputId;
      if (item.replyMarkdown !== null) messages.push({
        id: item.id, turnId: item.inputId, sender: null, createdAt: item.replyCreatedAt, markdown: item.replyMarkdown, attachments: [],
      });
      turnStart = messages.length;
    }
  }
  return messages;
}

export function initialShareSelection(messages: readonly ShareMessage[], anchor: string): Set<string> {
  const message = messages.find(message => message.id === anchor);
  return new Set(messages.filter(candidate => message && candidate.turnId === message.turnId).map(message => message.id));
}

/**
 * A plain toggle flips one message. A range toggle applies the clicked message's new state
 * to every candidate between it and the previously toggled message, inclusive.
 */
export function toggleShareSelection(candidates: readonly ShareMessage[], selected: ReadonlySet<string>, id: string,
  rangeFrom: string | null): Set<string> {
  const end = candidates.findIndex(message => message.id === id);
  if (end < 0) return new Set(selected);
  const start = rangeFrom === null ? -1 : candidates.findIndex(message => message.id === rangeFrom);
  const [from, to] = start < 0 ? [end, end] : [Math.min(start, end), Math.max(start, end)];
  const value = !selected.has(id);
  const next = new Set(selected);
  for (const message of candidates.slice(from, to + 1)) {
    if (value) next.add(message.id); else next.delete(message.id);
  }
  return next;
}

/**
 * Older pages extend the excerpt backwards only. The reread also covers the already captured range;
 * keeping the captured messages as they are prevents output saved after sharing opened from entering the dialog.
 */
export function prependEarlierShareMessages(loaded: readonly ShareMessage[], current: readonly ShareMessage[]): ShareMessage[] {
  const known = new Set(current.map(message => message.id));
  const overlap = loaded.findIndex(message => known.has(message.id));
  return [...loaded.slice(0, overlap < 0 ? loaded.length : overlap), ...current];
}

/** Adjacent messages of one turn form a group. */
export function shareTurnGroups(messages: readonly ShareMessage[]): ShareMessage[][] {
  const groups: ShareMessage[][] = [];
  for (const message of messages) {
    const group = groups.at(-1);
    if (group && group[0]!.turnId === message.turnId) group.push(message); else groups.push([message]);
  }
  return groups;
}

/** Attachments stay named references; exporting never opens their content source. */
export function shareMarkdown(messages: readonly ShareMessage[], label: (message: ShareMessage) => string): string {
  return messages.map(message => [
    `## ${label(message).replace(/[\r\n]/g, " ")}`,
    message.markdown,
    ...message.attachments.map(name => `> 📎 ${name.replace(/[\r\n]/g, " ")}`),
  ].filter(Boolean).join("\n\n")).join("\n\n---\n\n") + "\n";
}
