import { Bot, User, Zap } from "lucide-react";
import { withValues, type UiText } from "@asterism-app/sdk/contracts";
import type { AgentMessageSender } from "@asterism-app/builtin-api/contracts";
import { conversationMessages } from "../messages/conversation.ts";

/** Message surfaces and source icons are shared by conversation, drafts, and history. */
export const messageAppearance = {
  user: { Icon: User, surface: "bg-muted text-foreground" },
  agent: { Icon: Bot, surface: "bg-external-message text-external-message-foreground" },
  event: { Icon: Zap, surface: "bg-event-message text-event-message-foreground" },
} satisfies Record<AgentMessageSender["kind"], { Icon: typeof User; surface: string }>;

/** Saved names identify sources consistently across full messages and compact previews. */
export function messageSenderLabel(sender: AgentMessageSender): UiText {
  switch (sender.kind) {
    case "user": return conversationMessages.you;
    case "agent": return `${sender.name}${sender.mesh?.id ? ` [${sender.mesh.id}]` : ""}`;
    case "event": return withValues(conversationMessages.eventSource, { name: sender.name });
  }
}
