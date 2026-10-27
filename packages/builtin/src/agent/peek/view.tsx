import { ScanSearch } from "lucide-react";
import { toolRenderer, useI18n, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { StreamingPreview } from "@asterism-app/ui/streaming-preview";
import { AgentPeek, type PeekResult } from "./contract";
import { peekMessages as messages } from "../../messages/peek";
import { Markdown } from "../conversation/Markdown";

function Header({ phase, invocation, result }: ToolRenderProps<PeekResult>) {
  const i18n = useI18n();
  const status = phase === "input" ? messages.preparing : phase === "ready" ? messages.waiting
    : phase === "settled" ? result.kind === "succeeded" ? messages.done : null
      : messages[result?.data?.phase ?? "investigating"];
  return <ToolHeader label={i18n.text(messages.title)} subject={invocation.resource?.title}
    meta={status ? i18n.text(status) : undefined} />;
}

/** The body presents only the report; the title and shared shell handle process status and outcome. */
function Body({ phase, result }: ToolRenderProps<PeekResult>) {
  const report = result?.data?.report;
  if (!report) return null;
  const streaming = phase === "executing";
  return streaming
    ? <StreamingPreview><Markdown streaming>{report}</Markdown></StreamingPreview>
    : <Markdown>{report}</Markdown>;
}

export const peekToolRenderer = toolRenderer(AgentPeek, {
  label: messages.title, icon: <ScanSearch className="size-3.5" />,
  input: { headerRenderer: Header },
  execution: { headerRenderer: Header, bodyRenderer: Body, streaming: ({ result }) => !!result?.data?.report },
  result: { headerRenderer: Header, bodyRenderer: Body },
});
