import { Bot } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import type { AgentMessageSender } from "@asterism-app/builtin-api/contracts";
import { conversationMessages } from "../../messages/conversation";

/** Sender identification shared by the conversation and draft box; routing handles are not shown to users. */
export function MessageSender({ sender }: { sender: AgentMessageSender }) {
  const i18n = useI18n();
  return sender.kind === "agent"
    ? <p className="type-label flex min-w-0 items-center gap-1.5">
      <Bot className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate" title={sender.name}>{sender.name}</span>
    </p>
    : <p className="type-label text-right">{i18n.text(conversationMessages.you)}</p>;
}
