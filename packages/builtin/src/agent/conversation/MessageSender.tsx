import { useI18n } from "@asterism-app/sdk/renderer";
import type { AgentMessageSender } from "@asterism-app/builtin-api/contracts";
import { messageAppearance, messageSenderLabel } from "../message-presentation";

/** Full message header; compact views use the same source presentation. */
export function MessageSender({ sender }: { sender: AgentMessageSender }) {
  const i18n = useI18n();
  const name = i18n.text(messageSenderLabel(sender));
  if (sender.kind === "user") return <p className="type-label text-right">{name}</p>;
  const { Icon } = messageAppearance[sender.kind];
  return <p className="type-label flex min-w-0 items-center gap-1.5">
    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
    <span className="truncate" title={name}>{name}</span>
  </p>;
}
