import { useMemo } from "react";
import { useI18n } from "@atelier/sdk/renderer";
import { ChatMinimap } from "@atelier/ui/ui/chat-minimap";
import { conversationMessages } from "../../messages/conversation";
import type { TimelineItem } from "./timeline";

type UserMessage = Extract<TimelineItem, { kind: "message" }>;

/** 在交给 Tooltip 前截断；纯附件消息使用文件名，不加载文件内容。 */
function preview(message: UserMessage): string {
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
  const items = useMemo(() => timeline.filter((item): item is UserMessage => item.kind === "message")
    .map((message, index) => ({
      id: message.id,
      label: i18n.formatMessage(conversationMessages.minimapMessage, { number: index + 1 }),
      preview: preview(message),
    })), [timeline, i18n]);
  return <ChatMinimap items={items} label={i18n.formatMessage(conversationMessages.minimap)} onSelect={onSelect} />;
}
