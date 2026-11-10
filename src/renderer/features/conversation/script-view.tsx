import { useEffect, useState } from "react";
import type { z } from "zod";
import { CircleCheck, Ellipsis, Waypoints, Wrench } from "lucide-react";
import { toolRenderer, useRendererTools, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import type { Json } from "@asterism-app/sdk/contracts";
import { CodeText } from "@asterism-app/ui/code-view";
import { JsonView } from "@asterism-app/ui/json-view";
import { StreamingPreview } from "@asterism-app/ui/streaming-preview";
import { ToolDetailsSwitcher } from "@asterism-app/ui/tool-content";
import { IconSummary } from "@asterism-app/ui/icon-summary";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { toolOutcomeLabels, toolOutcomeTone } from "@asterism-app/ui/tool-outcome";
import { StatusIcon } from "@asterism-app/ui/ui/status";
import { ResourceScriptResult, type ScriptCall } from "../../../tools/core";
import { toolsMessages as messages } from "../../messages/tools";
import { useI18n } from "../../shared/i18n";
import { groupScriptCalls, scriptCallTotals, type ScriptCallGroup } from "./script-calls";

type Props = ToolRenderProps<z.infer<typeof ResourceScriptResult.schema>>;
const language = "javascript";

function scriptCode(args: Json): string {
  return args && typeof args === "object" && !Array.isArray(args) && typeof args.code === "string" ? args.code : "";
}
function scriptCalls(props: Props): readonly ScriptCall[] {
  return props.result?.data?.calls ?? [];
}

/** Current time while any call runs; settled groups use their recorded finish. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** Live progress counts settled calls against submitted calls; settled scripts show the total. Failures inside a successful script stay visible. */
function Header(props: Props) {
  const i18n = useI18n();
  const tools = useRendererTools();
  const calls = scriptCalls(props);
  const totals = scriptCallTotals(calls);
  const items = groupScriptCalls(calls, "tool").map(group => {
    const implementation = group.call.implementation?.id ?? null;
    return {
      key: group.key,
      icon: tools.icon(group.call.name, implementation) ?? <Wrench />,
      label: tools.label(group.call.name, implementation) ?? group.call.tool ?? group.call.name,
      count: group.count,
    };
  });
  const live = props.phase === "ready" || props.phase === "executing";
  const count = live ? `${totals.settled}/${totals.total}` : totals.total ? i18n.formatMessage(messages.toolScriptCalls, { count: totals.total }) : null;
  return <ToolHeader label={i18n.text(messages.toolResourceScript)} summary={items.length ? <IconSummary items={items} /> : undefined} meta={(count || totals.failed || totals.partial) ? <>
    {count}
    {totals.failed > 0 && <span> · {i18n.formatMessage(messages.toolScriptFailedCount, { count: totals.failed })}</span>}
    {totals.partial > 0 && <> · {i18n.formatMessage(messages.toolScriptPartialCount, { count: totals.partial })}</>}
  </> : undefined} />;
}

function GroupRow({ group, now }: { group: ScriptCallGroup; now: number }) {
  const i18n = useI18n();
  const tools = useRendererTools();
  const { call } = group;
  const implementation = call.implementation?.id ?? null;
  const name = tools.label(call.name, implementation) ?? call.tool ?? call.name;
  const icon = tools.icon(call.name, implementation) ?? <Wrench />;
  const status = group.running ? i18n.text(messages.toolScriptRunning)
    : group.queued ? i18n.text(messages.toolScriptQueued) : group.worst && i18n.text(toolOutcomeLabels[group.worst]);
  const failed = Object.entries(group.settled).reduce((sum, [kind, count]) =>
    toolOutcomeTone(kind as keyof typeof group.settled) === "error" ? sum + count : sum, 0);
  const elapsed = group.startedAt === undefined ? undefined : Math.max(0, (group.finishedAt ?? now) - group.startedAt) / 1000;
  return <li className="space-y-1">
    <div className="flex min-w-0 items-center gap-2 type-caption">
      <span className="inline-flex shrink-0 [&_svg]:size-3.5" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1 truncate" title={[name, call.resource?.title].filter(Boolean).join(" · ")}>
        {name}{call.resource?.title && <span className="text-muted-foreground"> · {call.resource.title}</span>}
      </span>
      {group.count > 1 && <span className="shrink-0 tabular-nums text-muted-foreground">×{group.count}</span>}
      {failed > 0 && failed < group.count && <span className="shrink-0 text-destructive">
        {i18n.formatMessage(messages.toolScriptFailedCount, { count: failed })}
      </span>}
      {elapsed !== undefined && <span className="shrink-0 tabular-nums text-muted-foreground">
        {i18n.formatMessage(messages.toolScriptElapsed, { seconds: group.finishedAt === undefined ? Math.floor(elapsed) : elapsed.toFixed(1) })}
      </span>}
      {group.running ? <StatusIcon tone="progress" className="size-3 shrink-0" />
        : group.queued ? <Ellipsis aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
          : group.worst && <StatusIcon tone={toolOutcomeTone(group.worst)} icon={group.worst === "succeeded" ? CircleCheck : undefined} className="size-3 shrink-0" />}
      {status && <span className="sr-only">{status}</span>}
    </div>
    {group.diagnostics.map(diagnostic => <p key={diagnostic} className="pl-5.5 type-caption whitespace-pre-wrap break-words text-destructive">{diagnostic}</p>)}
  </li>;
}

function CallList({ calls }: { calls: readonly ScriptCall[] }) {
  const groups = groupScriptCalls(calls);
  const now = useNow(groups.some(group => group.running > 0));
  return groups.length ? <ul className="space-y-1.5">{groups.map(group => <GroupRow key={group.key} group={group} now={now} />)}</ul> : null;
}

function ResultScriptCode({ code }: { code: string }) {
  const [formatted, setFormatted] = useState<{ source: string; contents: string }>();
  useEffect(() => {
    let active = true;
    void import("./script-code").then(({ formatScriptCode }) => formatScriptCode(code)).then(contents => {
      if (active) setFormatted({ source: code, contents });
    });
    return () => { active = false; };
  }, [code]);
  return <CodeText contents={formatted?.source === code ? formatted.contents : code} language={language} lineNumbers overflow="wrap" />;
}

/** Each entry is one log() emission; numbering keeps multiline values and repeated shapes distinct. */
function ScriptLogs({ logs }: { logs: readonly Json[] }) {
  return <ol className="flex min-w-0 max-h-80 flex-col gap-3 overflow-auto">
    {logs.map((entry, index) => <li key={index} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
      <span aria-hidden="true" className="font-mono text-xs leading-relaxed tabular-nums text-muted-foreground">#{index + 1}</span>
      <JsonView value={entry} className="max-h-none overflow-visible" />
    </li>)}
  </ol>;
}

function Body(props: Props) {
  const i18n = useI18n();
  const code = scriptCode(props.args);
  if (props.phase === "input") return code ? <StreamingPreview><CodeText contents={code} language={language} lineNumbers overflow="wrap" /></StreamingPreview> : null;
  const logs = props.result?.data?.logs ?? [];
  const value = props.phase === "settled" ? props.result.data?.value : undefined;
  return <div className="flex flex-col gap-3">
    <CallList calls={scriptCalls(props)} />
    {(code || logs.length > 0 || value !== undefined) && <ToolDetailsSwitcher stateKey="asterism/resource-script-details" items={[
      ...(code ? [{ value: "code", label: i18n.text(messages.toolScriptCode),
        render: () => props.phase === "settled" ? <ResultScriptCode code={code} />
          : <CodeText contents={code} language={language} lineNumbers overflow="wrap" /> }] : []),
      ...(logs.length > 0 ? [{ value: "logs", label: i18n.text(messages.toolScriptLogs),
        render: () => <ScriptLogs logs={logs} /> }] : []),
      ...(value !== undefined ? [{ value: "result", label: i18n.text(messages.toolScriptValue),
        render: () => <JsonView value={value} /> }] : []),
    ]} />}
  </div>;
}

/** Calls, logs, return value, and source replace the shell's raw argument and result details. */
export const scriptToolRenderer = toolRenderer(ResourceScriptResult, {
  label: messages.toolResourceScript, icon: <Waypoints className="size-3.5" />, details: false,
  input: { headerRenderer: Header, bodyRenderer: Body, streaming: props => scriptCode(props.args).length > 0 },
  execution: { headerRenderer: Header, bodyRenderer: Body, streaming: props => scriptCalls(props).length > 0 || (props.result?.data?.logs.length ?? 0) > 0 },
  result: { headerRenderer: Header, bodyRenderer: Body },
});
