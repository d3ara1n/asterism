import { Send } from "lucide-react";
import { useI18n, type ToolRenderProps, type ToolRendererDefinition } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { StreamingPreview } from "@asterism-app/ui/streaming-preview";
import { inputFileName, type SendResult } from "@asterism-app/builtin-api/contracts";
import { fileReferencePartSchema, type Json } from "@asterism-app/sdk/contracts";
import { sendMessages as messages } from "../messages/send";
import { Markdown } from "@asterism-app/ui/markdown";
import { inputText, inputField, toolTextTail } from "./tool-preview";
import { messageTarget } from "./message-target";

type Props = ToolRenderProps<SendResult>;
function Header({ invocation, result, phase, target }: Props) {
  const i18n = useI18n();
  return <ToolHeader label={i18n.text(messages.title)} subject={messageTarget(target) ?? invocation.resource?.title}
    meta={phase === "settled" && result.kind === "succeeded" ? i18n.text(messages.accepted) : undefined} />;
}
/** Message parts of send input; display-only, so unfinished input yields the parts it already has. */
export function partsOf(args: Json): Json[] {
  const parts = inputField(args, "parts");
  if (Array.isArray(parts)) return parts;
  // Historical calls retain the original text-only argument.
  const message = inputText(args, "message");
  return message ? [{ kind: "text", text: message }] : [];
}
function Body({ args, phase }: Props) {
  const streaming = phase === "input";
  const content = <>{partsOf(args).map((part, index) => {
    if (inputText(part, "kind") === "text") {
      const text = inputText(part, "text") ?? "";
      return <Markdown key={index} streaming={streaming}>{streaming ? toolTextTail(text) : text}</Markdown>;
    }
    const file = fileReferencePartSchema.safeParse(part);
    return file.success ? <p key={index}>{inputFileName(file.data)}</p> : null;
  })}</>;
  return streaming ? <StreamingPreview>{content}</StreamingPreview> : content;
}
export const sendViews = {
  label: messages.title, icon: <Send className="size-3.5" />,
  input: { headerRenderer: Header, bodyRenderer: Body, streaming: ({ args }) => partsOf(args).length > 0 },
  execution: { headerRenderer: Header, bodyRenderer: Body },
  result: { headerRenderer: Header, bodyRenderer: Body },
} satisfies ToolRendererDefinition<SendResult>;
