import { HoverCard, HoverCardContent, HoverCardTrigger } from "@asterism-app/ui/ui/hover-card";
import { ProgressRing } from "@asterism-app/ui/ui/progress-ring";
import { cn } from "@asterism-app/ui/utils";
import { CircleCheck, Flame, Hand, MessageSquare, Moon, OctagonAlert, createLucideIcon, type LucideIcon } from "lucide-react";
import type { ResourceActivity, ResourceNotice } from "@asterism-app/sdk/contracts";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AppSnapshot } from "../../shared/contracts";
import { resourceStatusMessages as messages } from "../messages/resource-status";
import { useI18n } from "../shared/i18n";
import type { ResourceNoticeMark, SessionIndicator, SessionResourceState } from "./resource-status";

const noticeOrder = ["error", "attention", "success"] as const;
// Notices are outlined symbols without a plate: shape and tone carry the meaning.
const noticeShapes: Record<ResourceNotice["kind"], { icon: LucideIcon; tone: string }> = {
  error: { icon: OctagonAlert, tone: "text-destructive" },
  attention: { icon: Hand, tone: "text-warning" },
  success: { icon: CircleCheck, tone: "text-success" },
};
// Each mask clears a ring around one badge so it stays legible on any row background (hover, selection).
// Tailwind sizes scale with the root font size (appearance density), so the cut uses the same rem units as the badges:
// the state badge is size-3 (0.375rem radius) at -top-1 -right-1, centered 0.125rem inside the top-right corner;
// the instance mark is size-2.5 (0.3125rem radius) at -bottom-1 -right-1, centered 0.0625rem inside the bottom-right corner.
const masks = {
  state: "radial-gradient(circle at calc(100% - 0.125rem) 0.125rem, #0000 0.5rem, #000 calc(0.5rem + 0.5px))",
  instances: "radial-gradient(circle at calc(100% - 0.0625rem) calc(100% - 0.0625rem), #0000 0.4375rem, #000 calc(0.4375rem + 0.5px))",
};

function NoticeMark({ kind, className }: { kind: ResourceNotice["kind"]; className: string }) {
  const { icon: Icon, tone } = noticeShapes[kind];
  return <Icon aria-hidden="true" className={cn(tone, className)} />;
}

function StateBadge({ state }: { state: SessionResourceState }) {
  if (state.kind === "running") return <ProgressRing value={state.progress ?? "indeterminate"} strokeWidth={4} className="size-3 text-primary-text" />;
  return <NoticeMark kind={state.kind} className="size-3" />;
}

function InstanceMark({ className }: { className: string }) {
  return <Flame aria-hidden="true" className={cn("text-warning", className)} />;
}

/**
 * Lucide's coffee with the cup body and handle as separate paths, so a filled variant fills only the cup.
 * The outline renders the same as the original.
 */
const CoffeeCup = createLucideIcon("coffee-cup", [
  ["path", { d: "M10 2v2", key: "a" }], ["path", { d: "M14 2v2", key: "b" }], ["path", { d: "M6 2v2", key: "c" }],
  ["path", { d: "M17 9v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1z", key: "d" }],
  ["path", { d: "M17 8h1a4 4 0 1 1 0 8h-1", fill: "none", key: "e" }],
]);

/**
 * The session icon carries session state, filled once the session is completed; the top-right badge carries resource state
 * and the bottom-right mark open instances. Icons fill through currentColor, so open strokes such as a cup handle opt out per path.
 */
export function SessionGlyph({ session, indicator }: {
  session: Pick<AppSnapshot["sessions"][number], "sleeping" | "keepAwake" | "completed">;
  indicator?: SessionIndicator;
}) {
  // Keep-awake takes effect once the session is awake; completion fills any of the three icons.
  const Icon = session.sleeping ? Moon : session.keepAwake ? CoffeeCup : MessageSquare;
  const state = indicator?.state;
  const hasInstances = (indicator?.instances ?? 0) > 0;
  const layers = [state && masks.state, hasInstances && masks.instances].filter(Boolean);
  const style: CSSProperties | undefined = layers.length === 0 ? undefined : { maskImage: layers.join(", "), maskComposite: "intersect", maskRepeat: "no-repeat" };
  return <span className="relative flex size-4 shrink-0">
    <Icon aria-hidden="true" fill={session.completed ? "currentColor" : "none"} className="size-4 text-muted-foreground" style={style} />
    {state && <span className="absolute -top-1 -right-1 flex"><StateBadge state={state} /></span>}
    {hasInstances && <InstanceMark className="absolute -right-1 -bottom-1 size-2.5" />}
  </span>;
}

export function hasSessionIndicator(indicator: SessionIndicator): boolean {
  return indicator.state !== null || indicator.instances > 0;
}

function DetailRow({ icon, title, label }: { icon: ReactNode; title: string; label: ReactNode }) {
  return <li className="flex h-8 min-w-0 items-center gap-2 rounded-sm px-2 text-sm">
    <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
    <span className="min-w-0 flex-1 truncate">{title}</span>
    <span className="type-caption shrink-0 tabular-nums">{label}</span>
  </li>;
}

/**
 * Hovering the session icon previews resource details; clicking pins them until an outside press or Escape.
 * Details do not navigate; entering the session consumes only notices.
 */
export function SessionStatus({ indicator, activities, notices, children }: {
  indicator: SessionIndicator; activities: readonly ResourceActivity[]; notices: readonly ResourceNoticeMark[]; children: ReactNode;
}) {
  const i18n = useI18n();
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = [
    indicator.state && i18n.text(messages[indicator.state.kind]),
    indicator.instances > 0 && i18n.formatMessage(messages.instanceSummary, { count: indicator.instances }),
  ].filter(Boolean).join(" · ");
  const sortedNotices = [...notices].sort((a, b) => noticeOrder.indexOf(a.kind) - noticeOrder.indexOf(b.kind));
  const sortedActivities = [...activities].sort((a, b) => Number(a.kind === "instance") - Number(b.kind === "instance"));
  return <HoverCard open={open} openDelay={300} closeDelay={100} onOpenChange={next => { if (next || !pinned.current) setOpen(next); }}>
    <HoverCardTrigger asChild>
      <button ref={trigger} type="button" aria-label={label}
        className="-m-1 flex cursor-pointer rounded-sm p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => { pinned.current = !pinned.current; setOpen(pinned.current); }}>
        {children}
      </button>
    </HoverCardTrigger>
    <HoverCardContent side="right" align="start" sideOffset={8} collisionPadding={8} className="w-72 p-1" aria-label={label}
      onPointerDownOutside={event => {
        // The trigger's own click toggles pinning.
        if (trigger.current?.contains(event.target as Node)) event.preventDefault();
        else pinned.current = false;
      }}
      onEscapeKeyDown={() => { pinned.current = false; }}>
      <ul className="flex max-h-80 flex-col overflow-y-auto">
        {sortedNotices.map(notice => <DetailRow key={JSON.stringify([notice.resource.id, notice.kind])} title={i18n.text(notice.title)}
          icon={<NoticeMark kind={notice.kind} className="size-4" />} label={i18n.text(messages[notice.kind])} />)}
        {sortedActivities.map(activity => activity.kind === "work"
          ? <DetailRow key={activity.id} title={i18n.text(activity.title)}
            icon={<ProgressRing value={activity.progress?.value ?? "indeterminate"} className="size-4 text-primary-text" />}
            label={activity.progress ? `${Math.round(activity.progress.value * 100)}%` : i18n.text(messages.running)} />
          : <DetailRow key={activity.id} title={i18n.text(activity.title)} icon={<InstanceMark className="size-4" />} label={i18n.text(messages.instanceOpen)} />)}
      </ul>
    </HoverCardContent>
  </HoverCard>;
}
