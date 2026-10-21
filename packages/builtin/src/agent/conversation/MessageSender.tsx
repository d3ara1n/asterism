import { Bot } from "lucide-react";
import { useI18n } from "@atelier/sdk/renderer";
import type { AgentMessageSender } from "@atelier/builtin-api/contracts";
import { conversationMessages } from "../../messages/conversation";

/** 对话与草稿箱共用发送者标识；不向用户展示路由句柄。 */
export function MessageSender({ sender }: { sender: AgentMessageSender }) {
  const i18n = useI18n();
  return sender.kind === "agent"
    ? <p className="type-label flex min-w-0 items-center gap-1.5">
      <Bot className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate" title={sender.name}>{sender.name}</span>
    </p>
    : <p className="type-label text-right">{i18n.text(conversationMessages.you)}</p>;
}
