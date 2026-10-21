import { Send } from "lucide-react";
import { toolRenderer, useI18n, type ToolRenderProps } from "@atelier/sdk/renderer";
import { ToolHeader } from "@atelier/ui/tool-header";
import { AgentSend, type SendResult } from "./contract";
import { sendMessages as messages } from "../../messages/send";
import { Markdown } from "../conversation/Markdown";

type Props = ToolRenderProps<SendResult, null, { message: string }>;
const field = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const text = (value as Record<string, unknown>)[key];
  return typeof text === "string" ? text : undefined;
};
function Header({ invocation, result, phase }: Props) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.title)} subject={invocation.resource?.title}
    meta={phase === "settled" && result.kind === "succeeded" ? i18n.text(messages.accepted) : undefined} />;
}
function Body({ args }: Props) {
  const message = field(args, "message");
  return message ? <Markdown>{message}</Markdown> : null;
}
export const sendToolRenderer = toolRenderer(AgentSend, {
  label: messages.title, icon: <Send className="size-3.5" />,
  input: { headerRenderer: Header, bodyRenderer: Body },
  execution: { headerRenderer: Header, bodyRenderer: Body },
  result: { headerRenderer: Header, bodyRenderer: Body },
});
