import { Send } from "lucide-react";
import { useI18n, type ToolRenderProps, type ToolRendererDefinition } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import type { SendResult } from "@asterism-app/builtin-api/contracts";
import { sendMessages as messages } from "../messages/send";
import { Markdown } from "../agent/conversation/Markdown";
import { inputText } from "./tool-preview";
import { messageTarget } from "./message-target";

type Props = ToolRenderProps<SendResult>;
function Header({ invocation, result, phase, target }: Props) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.title)} subject={messageTarget(target) ?? invocation.resource?.title}
    meta={phase === "settled" && result.kind === "succeeded" ? i18n.text(messages.accepted) : undefined} />;
}
function Body({ args }: Props) {
  const message = inputText(args, "message");
  return message ? <Markdown>{message}</Markdown> : null;
}
export const sendViews = {
  label: messages.title, icon: <Send className="size-3.5" />,
  input: { headerRenderer: Header, bodyRenderer: Body, streaming: ({ args }) => !!inputText(args, "message") },
  execution: { headerRenderer: Header, bodyRenderer: Body },
  result: { headerRenderer: Header, bodyRenderer: Body },
} satisfies ToolRendererDefinition<SendResult>;
