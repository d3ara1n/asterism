import { useEffect, useState } from "react";
import { Terminal, FileText } from "lucide-react";
import { toolRenderer, useI18n, type ToolRenderProps } from "@asterism/sdk/renderer";
import { Button } from "@asterism/ui/ui/button";
import { ToolHeader } from "@asterism/ui/tool-header";
import { StreamingPreview } from "@asterism/ui/streaming-preview";
import { DirectoryExec } from "./exec-contract";
import type { ExecResult } from "../shell/contract";
import { shellMessages as messages } from "../messages/shell";
import { inputText } from "../shared/tool-preview";
import { useBuiltinRendererServices } from "../renderer-context";

function Header({ phase, invocation, result }: ToolRenderProps<ExecResult>) {
  const i18n = useI18n(), data = result?.data;
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
  return <ToolHeader label={i18n.text(messages.exec)} subject={invocation.resource?.title}
    meta={durationMs !== undefined && i18n.formatMessage(messages.elapsed, { seconds })} />;
}

function Body({ args, phase, result }: ToolRenderProps<ExecResult>) {
  const i18n = useI18n(), services = useBuiltinRendererServices();
  const [opening, setOpening] = useState(false), [error, setError] = useState(false);
  const data = result?.data;
  const settled = phase === "settled", command = inputText(args, "command");
  if (!data && !settled) return null;
  return <div className="flex flex-col gap-3">
    {settled && command !== undefined && <section className="min-w-0 space-y-1 text-xs leading-relaxed">
      <h4 className="type-caption">{i18n.text(messages.input)}</h4>
      <pre className="type-code m-0 max-h-96 overflow-auto whitespace-pre-wrap break-all">{command}</pre>
    </section>}
    {settled && data && <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 type-caption">
      <span className="min-w-0 break-all">{i18n.text(messages.title)}: <span className="type-code">{data.shell}</span></span>
      {data.exitCode !== null && <span>{i18n.formatMessage(messages.exit, { code: data.exitCode })}</span>}
      {data.signal !== null && <span>{i18n.formatMessage(messages.signal, { signal: data.signal })}</span>}
      {data.termination !== "exited" && <span>{i18n.formatMessage(messages.termination, { reason: data.termination })}</span>}
    </div>}
    {data && <section className="min-w-0 space-y-1 text-xs leading-relaxed">
      {settled && <h4 className="type-caption">{i18n.text(messages.output)}</h4>}
      {phase === "executing"
        ? <StreamingPreview><pre className="type-code m-0 whitespace-pre-wrap break-all">{data.output}</pre></StreamingPreview>
        : <pre className="type-code m-0 max-h-96 overflow-auto whitespace-pre-wrap break-all">{data.output || i18n.text(messages.empty)}</pre>}
    </section>}
    {data?.truncation && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption">
      <span>{i18n.formatMessage(messages.truncated, { retained: data.truncation.retainedChars, total: data.truncation.totalChars })}</span>
      <Button variant="link" size="sm" className="h-auto p-0" disabled={opening} title={`${data.truncation.file}\n${i18n.text(messages.temporary)}`}
        onClick={async () => {
          setOpening(true); setError(false);
          try { await services.openLocalFile(data.truncation!.file); }
          catch { setError(true); }
          finally { setOpening(false); }
        }}><FileText className="size-3.5" />{i18n.text(messages.openLog)}</Button>
      {error && <span role="alert" className="text-destructive">{i18n.text(messages.openFailed)}</span>}
    </div>}
  </div>;
}
export const execToolRenderer = toolRenderer(DirectoryExec, {
  label: messages.exec, icon: <Terminal className="size-3.5" />,
  input: { headerRenderer: Header },
  execution: { headerRenderer: Header, bodyRenderer: Body, streaming: ({ result }) => !!result?.data?.output },
  result: { headerRenderer: Header, bodyRenderer: Body },
});
