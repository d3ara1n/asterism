import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { Flame, Hand, type LucideIcon } from "lucide-react";
import type { ResourceActivity, ResourceNotice } from "@asterism-app/sdk/contracts";
import { useId, type ReactNode } from "react";
import { resourceStatusMessages as messages } from "../messages/resource-status";
import { useI18n } from "../shared/i18n";
import { Button } from "@asterism-app/ui/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@asterism-app/ui/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { StatusIcon, type StatusTone } from "@asterism-app/ui/ui/status";
import { Progress } from "@asterism-app/ui/ui/progress";
import { summarizeResourceNotices, type ResourceNoticeMark } from "./resource-status";

const tones: Record<ResourceNotice["kind"], StatusTone> = { error: "error", attention: "warning", success: "success" };

function StatusDetails({ label, hint, title, tone, icon, still, count, children }: {
  label: string; hint?: string; title: string; tone: StatusTone; icon?: LucideIcon; still?: boolean; count: number; children: ReactNode;
}) {
  const titleId = useId();
  return <Popover>
    <Tooltip>
      <PopoverTrigger asChild><TooltipTrigger asChild>
        <Button variant="ghost" size="xs" aria-label={label} className="shrink-0 gap-1">
          <StatusIcon tone={tone} icon={icon} still={still} className="size-4" />
          {count > 1 && <span className="tabular-nums">{count}</span>}
        </Button>
      </TooltipTrigger></PopoverTrigger>
      <TooltipContent className="max-w-[min(24rem,var(--radix-tooltip-content-available-width))] whitespace-pre-wrap break-words text-left">{hint ?? label}</TooltipContent>
    </Tooltip>
    <PopoverContent side="right" align="start" className="p-2" aria-labelledby={titleId}>
      <h2 id={titleId} className="type-label px-2 py-1">{title}</h2>
      <ItemGroup className="max-h-80 overflow-y-auto">{children}</ItemGroup>
    </PopoverContent>
  </Popover>;
}

/** Live work and unviewed notices coexist. Details do not navigate; entering the session consumes only notices. */
export function SessionStatus({ activities, notices }: { activities: readonly ResourceActivity[]; notices: readonly ResourceNoticeMark[] }) {
  const i18n = useI18n();
  const kind = summarizeResourceNotices(notices);
  const instances = activities.filter(activity => activity.kind === "instance");
  const workCount = activities.length - instances.length;
  const activityLabel = [
    workCount > 0 && i18n.formatMessage(messages.activitySummary, { count: workCount }),
    instances.length > 0 && i18n.formatMessage(messages.instanceSummary, { count: instances.length }),
  ].filter(Boolean).join(" · ");
  const activityHint = [activityLabel, ...instances.map(activity => i18n.formatMessage(messages.instanceHint, { title: i18n.text(activity.title) }))].join("\n");
  return <>
    {activities.length > 0 && <StatusDetails tone="progress" icon={Flame} still={workCount === 0} count={activities.length} title={i18n.text(messages.activities)}
      label={activityLabel} hint={activityHint}>
      {activities.map(activity => <Item key={activity.id} size="sm" role="listitem">
        <ItemMedia><StatusIcon tone="progress" icon={Flame} still={activity.kind === "instance"} className="size-4" /></ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full"><TooltipHint content={i18n.text(activity.title)}><span className="truncate">{i18n.text(activity.title)}</span></TooltipHint></ItemTitle>
          {activity.kind === "instance" && <ItemDescription>{i18n.text(messages.instanceOpen)}</ItemDescription>}
          {activity.kind === "work" && activity.progress && <Progress value={activity.progress.value * 100} aria-label={i18n.text(activity.title)} />}
        </ItemContent>
      </Item>)}
    </StatusDetails>}
    {kind && <StatusDetails tone={tones[kind]} icon={kind === "attention" ? Hand : undefined} count={notices.length}
      title={i18n.text(messages.notices)} label={i18n.formatMessage(messages.noticeSummary, { kind: i18n.text(messages[kind]), count: notices.length })}>
      {notices.map(notice => <Item key={JSON.stringify([notice.resource.sessionId, notice.resource.id, notice.kind])} size="sm" role="listitem">
        <ItemMedia><StatusIcon tone={tones[notice.kind]} icon={notice.kind === "attention" ? Hand : undefined} className="size-4" /></ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full"><TooltipHint content={i18n.text(notice.title)}><span className="truncate">{i18n.text(notice.title)}</span></TooltipHint></ItemTitle>
          <ItemDescription>{i18n.text(messages[notice.kind])}</ItemDescription>
        </ItemContent>
      </Item>)}
    </StatusDetails>}
  </>;
}
