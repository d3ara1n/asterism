import { displayInputParts, inputFileName, type AgentMessageSender } from "@asterism-app/builtin-api/contracts";
import type { TimelineItem } from "./timeline";

export interface ShareMessage {
  id: string;
  turnId: string;
  sender: AgentMessageSender | null;
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
      if (markdown.trim() || attachments.length) messages.push({ id: item.id, turnId, sender: item.sender, markdown, attachments });
    } else if (item.kind === "turn-metrics") {
      // The reading window may begin with a steer input after the original turn start.
      for (let index = turnStart; index < messages.length; index++) messages[index]!.turnId = item.inputId;
      if (item.replyMarkdown !== null) messages.push({
        id: item.id, turnId: item.inputId, sender: null, markdown: item.replyMarkdown, attachments: [],
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

/** Attachments stay named references; exporting never opens their content source. */
export function shareMarkdown(messages: readonly ShareMessage[], label: (message: ShareMessage) => string): string {
  return messages.map(message => [
    `## ${label(message).replace(/[\r\n]/g, " ")}`,
    message.markdown,
    ...message.attachments.map(name => `> 📎 ${name.replace(/[\r\n]/g, " ")}`),
  ].filter(Boolean).join("\n\n")).join("\n\n---\n\n") + "\n";
}
