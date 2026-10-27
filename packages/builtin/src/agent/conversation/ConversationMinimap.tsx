import { useMemo } from "react";
import { useI18n } from "@asterism/sdk/renderer";
import { ChatMinimap } from "@asterism/ui/ui/chat-minimap";
import { conversationMessages } from "../../messages/conversation";
import type { TimelineItem } from "./timeline";

type AgentInputMessage = Extract<TimelineItem, { kind: "message" }>;

/** Truncates before passing to Tooltip; attachment-only messages use filenames without loading file contents. */
function preview(message: AgentInputMessage): string {
  const text = message.parts.filter(part => part.kind === "text").map(part => part.text);
  const sources = text.some(value => value.trim()) ? text
    : message.parts.filter(part => part.kind === "file").map(part => part.filename ?? part.mediaType);
  const characters: string[] = [];
  for (const source of sources) {
    if (characters.length) characters.push("\n");
    for (const character of source.trim()) {
      characters.push(character);
      if (characters.length > 240) return `${characters.slice(0, 240).join("")}…`;
    }
  }
  return characters.join("");
}

export function ConversationMinimap({ timeline, onSelect }: {
  timeline: readonly TimelineItem[];
  onSelect(id: string): void;
}) {
  const i18n = useI18n();
  const items = useMemo(() => timeline.filter((item): item is AgentInputMessage => item.kind === "message")
    .map((message, index) => ({
      id: message.id,
      label: i18n.formatMessage(conversationMessages.minimapMessage, { number: index + 1 }),
      preview: message.sender.kind === "agent" ? `${message.sender.name}\n${preview(message)}` : preview(message),
    })), [timeline, i18n]);
  return <ChatMinimap items={items} label={i18n.formatMessage(conversationMessages.minimap)} onSelect={onSelect} />;
}
