import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { useEffect, useState } from "react";
import { Terminal, FileText } from "lucide-react";
import { HeaderExcerpt, StreamingScrollArea, toolRenderer, useI18n, useRendererApplication, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { ToolScrollArea, useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { StreamingPreview } from "@asterism-app/ui/streaming-preview";
import { DirectoryExec } from "./exec-contract";
import type { ExecResult } from "@asterism-app/sdk/contracts";
import { shellMessages as messages } from "@asterism-app/ui/messages/shell";
import { inputText, toolTextTail } from "../shared/tool-preview";

function Header({ args, phase, invocation, result }: ToolRenderProps<ExecResult>) {
  const i18n = useI18n(), data = result?.data;
  const command = inputText(args, "command");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (phase !== "executing") return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  const durationMs = phase === "executing" && invocation.startedAt !== undefined
    ? Math.max(0, now - invocation.startedAt) : data?.durationMs;
  const seconds = durationMs === undefined ? "" : (durationMs / 1000).toFixed(1);
  return <ToolHeader label={i18n.text(messages.exec)} subject={useToolResourceSubject(invocation.resource)}
    summary={command && <HeaderExcerpt text={command} font="mono" />}
    meta={durationMs !== undefined && i18n.formatMessage(messages.elapsed, { seconds })} />;
}

function Body({ args, phase, result }: ToolRenderProps<ExecResult>) {
  const i18n = useI18n(), services = useRendererApplication();
  const [opening, setOpening] = useState(false), [error, setError] = useState(false);
  const data = result?.data;
  const settled = phase === "settled", command = inputText(args, "command");
  if (phase === "input") return command ? <StreamingPreview>
    <pre className="type-code m-0 whitespace-pre-wrap break-all">{toolTextTail(command)}</pre>
  </StreamingPreview> : null;
  const outputLabel = i18n.text(messages.output);
  return <div className="flex min-w-0 flex-col gap-3">
    {command !== undefined && <section className="flex min-w-0 flex-col gap-1 text-xs leading-relaxed">
      <h4 className="type-caption">{i18n.text(messages.input)}</h4>
      <ToolScrollArea className="max-h-28"><pre className="type-code m-0 whitespace-pre-wrap break-all">{command}</pre></ToolScrollArea>
    </section>}
    <section className="flex min-w-0 flex-col gap-1 text-xs leading-relaxed">
      <h4 className="type-caption">{outputLabel}</h4>
      <StreamingScrollArea label={outputLabel} initialScrollPosition={settled ? "start" : "end"}>
        {data?.output ? <pre className="type-code m-0 whitespace-pre-wrap break-all">{data.output}</pre>
          : <p className="type-caption">{i18n.text(settled ? messages.empty : messages.noOutputYet)}</p>}
      </StreamingScrollArea>
    </section>
    {settled && data && <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 type-caption">
      <span className="min-w-0 break-all">{i18n.text(messages.title)}: <span className="type-code">{data.shell}</span></span>
      {data.exitCode !== null && <span>{i18n.formatMessage(messages.exit, { code: data.exitCode })}</span>}
      {data.signal !== null && <span>{i18n.formatMessage(messages.signal, { signal: data.signal })}</span>}
      {data.termination !== "exited" && <span>{i18n.formatMessage(messages.termination, { reason: data.termination })}</span>}
    </div>}
    {data?.truncation && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption">
      <span>{i18n.formatMessage(messages.truncated, { retained: data.truncation.retainedChars, total: data.truncation.totalChars })}</span>
      <TooltipHint content={`${data.truncation.file}\n${i18n.text(messages.temporary)}`}><Button variant="link" size="sm" className="h-auto p-0" disabled={opening}
        onClick={async () => {
          setOpening(true); setError(false);
          try { await services.openLocalFile(data.truncation!.file); }
          catch { setError(true); }
          finally { setOpening(false); }
        }}><FileText className="size-3.5" />{i18n.text(messages.openLog)}</Button></TooltipHint>
      {error && <span role="alert" className="text-destructive">{i18n.text(messages.openFailed)}</span>}
    </div>}
  </div>;
}
export const execToolRenderer = toolRenderer(DirectoryExec, {
  label: messages.exec, icon: <Terminal className="size-3.5" />,
  input: { headerRenderer: Header, bodyRenderer: Body, streaming: ({ args }) => !!inputText(args, "command") },
  execution: { headerRenderer: Header, bodyRenderer: Body, streaming: ({ result }) => !!result?.data?.output },
  result: { headerRenderer: Header, bodyRenderer: Body },
});
