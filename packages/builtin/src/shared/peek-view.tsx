import { ScanSearch } from "lucide-react";
import { HeaderExcerpt, StreamingScrollArea, useI18n, type ToolRenderProps, type ToolRendererDefinition } from "@asterism-app/sdk/renderer";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { ToolScrollArea, useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { StreamingPreview } from "@asterism-app/ui/streaming-preview";
import type { PeekResult } from "@asterism-app/builtin-api/contracts";
import { peekMessages as messages } from "../messages/peek";
import { Markdown } from "@asterism-app/ui/markdown";
import { messageTarget } from "./message-target";
import { inputText, toolTextTail } from "./tool-preview";

function Header({ args, phase, invocation, result, target }: ToolRenderProps<PeekResult>) {
  const i18n = useI18n(), resource = useToolResourceSubject(invocation.resource);
  const recipient = messageTarget(target), question = inputText(args, "question");
  const status = phase === "input" ? messages.preparing : phase === "ready" ? messages.waiting
    : phase === "settled" ? result.kind === "succeeded" ? messages.done : null
      : messages[result?.data?.phase ?? "investigating"];
  return <ToolHeader label={i18n.text(messages.title)} subject={recipient ? <HeaderExcerpt text={recipient} /> : resource}
    summary={question && <HeaderExcerpt text={question} />}
    meta={status ? i18n.text(status) : undefined} />;
}

function InputBody({ args }: ToolRenderProps<PeekResult>) {
  const question = inputText(args, "question");
  return question ? <StreamingPreview><p className="type-body whitespace-pre-wrap wrap-anywhere">{toolTextTail(question)}</p></StreamingPreview> : null;
}

/** Keep the question outside the report viewport, including before the first report delta. */
function Body({ args, phase, result }: ToolRenderProps<PeekResult>) {
  const i18n = useI18n(), question = inputText(args, "question"), report = result?.data?.report;
  const settled = phase === "settled", reportLabel = i18n.text(messages.report);
  return <div className="flex min-w-0 flex-col gap-3">
    {question && <section className="flex min-w-0 flex-col gap-1">
      <h4 className="type-caption">{i18n.text(messages.questionLabel)}</h4>
      <ToolScrollArea className="max-h-28"><p className="type-body whitespace-pre-wrap wrap-anywhere">{question}</p></ToolScrollArea>
    </section>}
    <section className="flex min-w-0 flex-col gap-1">
      <h4 className="type-caption">{reportLabel}</h4>
      <StreamingScrollArea label={reportLabel} initialScrollPosition={settled ? "start" : "end"}>
        {report ? <Markdown streaming={phase === "executing"}>{report}</Markdown>
          : <p className="type-caption">{i18n.text(settled ? messages.noReport : messages.noReportYet)}</p>}
      </StreamingScrollArea>
    </section>
  </div>;
}

export const peekViews = {
  label: messages.title, icon: <ScanSearch className="size-3.5" />,
  input: { headerRenderer: Header, bodyRenderer: InputBody, streaming: ({ args }) => !!inputText(args, "question") },
  execution: { headerRenderer: Header, bodyRenderer: Body, streaming: ({ result }) => !!result?.data?.report },
  result: { headerRenderer: Header, bodyRenderer: Body },
} satisfies ToolRendererDefinition<PeekResult>;
