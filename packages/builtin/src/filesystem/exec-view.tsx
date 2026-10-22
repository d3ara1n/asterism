import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Terminal, FileText } from "lucide-react";
import { toolRenderer, useI18n, type ToolRenderProps } from "@atelier/sdk/renderer";
import { Button } from "@atelier/ui/ui/button";
import { ToolHeader } from "@atelier/ui/tool-header";
import { DirectoryExec } from "./exec-contract";
import type { ExecResult } from "../shell/contract";
import { shellMessages as messages } from "../messages/shell";
import { inputText } from "../shared/tool-preview";
import { useBuiltinRendererServices } from "../renderer-context";

function Header({ args, phase, invocation, result }: ToolRenderProps<ExecResult>) {
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
  const label = data?.termination === "timeout" ? messages.timeout : data?.termination === "cancelled" ? messages.cancelled
    : data?.termination === "exited" ? messages.exit : messages.elapsed;
  return <ToolHeader label={i18n.text(messages.exec)} subject={inputText(args, "command")} monospace
    meta={data && i18n.formatMessage(label, { seconds, code: data.exitCode ?? data.signal ?? "—" })} />;
}

/** 纯文本直接跟随浏览器滚动视口；与 Markdown 排版和流式解析无关。 */
function StreamingOutput({ output }: { output: string }) {
  const viewport = useRef<HTMLPreElement>(null);
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    const element = viewport.current;
    element?.scrollTo({ top: element.scrollHeight, behavior: reducedMotion ? "instant" : "smooth" });
  }, [output, reducedMotion]);
  return <pre ref={viewport} className="type-code m-0 h-32 overflow-auto whitespace-pre-wrap break-all">{output}</pre>;
}

function Body({ phase, result }: ToolRenderProps<ExecResult>) {
  const i18n = useI18n(), services = useBuiltinRendererServices();
  const [opening, setOpening] = useState(false), [error, setError] = useState(false);
  const data = result?.data;
  if (!data) return null;
  return <div className="flex flex-col gap-2">
    <div className="min-w-0 text-xs leading-relaxed">
      {phase === "executing"
        ? <StreamingOutput output={data.output} />
        : <pre className="type-code m-0 max-h-96 overflow-auto whitespace-pre-wrap break-all">{data.output || i18n.text(messages.empty)}</pre>}
    </div>
    {data.truncation && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption">
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
  execution: { headerRenderer: Header, bodyRenderer: Body },
  result: { headerRenderer: Header, bodyRenderer: Body },
});
