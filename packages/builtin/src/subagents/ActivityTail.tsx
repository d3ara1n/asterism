import { Brain, MessageSquarePlus, Wrench } from "lucide-react";
import { useI18n, useRendererTools } from "@asterism-app/sdk/renderer";
import { StatusIcon, type StatusTone } from "@asterism-app/ui/ui/status";
import { subagentMessages as messages } from "../messages/subagents";
import type { ActivityEntry } from "./contract";

const toolTones: Record<Extract<ActivityEntry, { kind: "tool" }>["state"], StatusTone> = {
  running: "progress", succeeded: "success", partial: "warning", rejected: "error", failed: "error", cancelled: "neutral", unknown: "neutral",
};

/** One row per step: status icon, the operation's localized name, and a single-line subject. */
function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const i18n = useI18n(), tools = useRendererTools();
  if (entry.kind === "steer") return <li className="flex min-w-0 items-center gap-2">
    <StatusIcon tone="neutral" icon={MessageSquarePlus} className="size-3.5 shrink-0" />
    <span className="shrink-0">{i18n.text(messages.steering)}</span>
    <span className="min-w-0 truncate text-muted-foreground" title={entry.text}>{entry.text}</span>
  </li>;
  if (entry.kind === "thinking") return <li className="flex min-w-0 items-center gap-2">
    <StatusIcon tone={entry.state === "running" ? "progress" : "neutral"} icon={Brain} className="size-3.5 shrink-0" />
    <span>{i18n.text(messages.thinking)}</span>
  </li>;
  return <li className="flex min-w-0 items-center gap-2">
    <StatusIcon tone={toolTones[entry.state]} icon={entry.state === "running" ? undefined : Wrench} className="size-3.5 shrink-0" />
    {(() => {
      const label = tools.label(entry.name, entry.implementation);
      return label ? <span className="shrink-0" title={entry.name}>{label}</span> : <span className="shrink-0 font-mono">{entry.name}</span>;
    })()}
    {entry.subject && <span className="min-w-0 truncate font-mono text-muted-foreground" title={entry.subject}>{entry.subject}</span>}
    <span className="sr-only">{i18n.formatMessage(messages.toolState, { state: entry.state })}</span>
  </li>;
}
/** Recent steps supplied by the pool, with the count of omitted earlier steps. */
export function ActivityTail({ entries, total }: { entries: readonly ActivityEntry[]; total: number }) {
  const i18n = useI18n();
  if (!total) return null;
  const hidden = total - entries.length;
  return <div className="flex min-w-0 flex-col gap-1 text-xs">
    {hidden > 0 && <p className="type-caption">{i18n.formatMessage(messages.earlierSteps, { count: hidden })}</p>}
    <ul className="flex min-w-0 flex-col gap-1">{entries.map((entry, index) => <ActivityRow key={hidden + index} entry={entry} />)}</ul>
  </div>;
}
