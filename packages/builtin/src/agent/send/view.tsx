import { Send } from "lucide-react";
import { toolRenderer, useI18n, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { AgentSend, type SendResult } from "./contract";
import { sendMessages as messages } from "../../messages/send";
import { Markdown } from "../conversation/Markdown";
import { inputText } from "../../shared/tool-preview";

type Props = ToolRenderProps<SendResult, null, { message: string }>;
function Header({ invocation, result, phase }: Props) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.title)} subject={invocation.resource?.title}
    meta={phase === "settled" && result.kind === "succeeded" ? i18n.text(messages.accepted) : undefined} />;
}
function Body({ args }: Props) {
  const message = inputText(args, "message");
  return message ? <Markdown>{message}</Markdown> : null;
}
export const sendToolRenderer = toolRenderer(AgentSend, {
  label: messages.title, icon: <Send className="size-3.5" />,
  input: { headerRenderer: Header, bodyRenderer: Body, streaming: ({ args }) => !!inputText(args, "message") },
  execution: { headerRenderer: Header, bodyRenderer: Body },
  result: { headerRenderer: Header, bodyRenderer: Body },
});
