import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Bell, Pause, Pencil, Play, Repeat, RotateCcw } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { cn } from "@asterism-app/ui/utils";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Toggle } from "@asterism-app/ui/ui/toggle";
import { WheelPicker } from "@asterism-app/ui/ui/wheel-picker";
import { scheduleMessages as messages } from "../messages/schedules";
import { ConfigureTimer, ControlTimer, timerSettingsSchema, type TimerData, type TimerSettings } from "./contract";
import { FlipCard } from "./FlipCard";
import { BackFooter, MessageInput, MessageLine, ScheduleError, pad2, useScheduleAction } from "./shared";

type Phase = "running" | "paused" | "finished" | "stopped";
const phaseOf = (data: TimerData): Phase => data.nextAt !== null ? "running"
  : data.remainingMs === 0 ? "finished" : data.remainingMs < data.durationSeconds * 1000 ? "paused" : "stopped";
const ringTone: Record<Phase, string> = {
  running: "text-primary", paused: "text-warning", finished: "text-success", stopped: "text-muted-foreground",
};

/** Re-renders just after each displayed second changes until the deadline passes. */
function useRemainingMs(data: TimerData): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (data.nextAt === null) return;
    const deadline = data.nextAt;
    let clock: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now(), left = deadline - current;
      setNow(current);
      if (left > 0) clock = setTimeout(tick, (left % 1000 || 1000) + 5);
    };
    tick();
    return () => clearTimeout(clock);
  }, [data.nextAt]);
  return data.nextAt === null ? data.remainingMs : Math.max(0, data.nextAt - now);
}

function formatDuration(totalSeconds: number, withHours: boolean): string {
  const hours = Math.floor(totalSeconds / 3600), minutes = Math.floor(totalSeconds / 60) % 60, seconds = totalSeconds % 60;
  return withHours ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`;
}

function Ring({ data, phase }: { data: TimerData; phase: Phase }) {
  const i18n = useI18n(), reduced = useReducedMotion();
  const remainingMs = useRemainingMs(data), totalMs = data.durationSeconds * 1000;
  const fraction = phase === "finished" ? 1 : Math.min(1, remainingMs / totalMs);
  const digits = formatDuration(Math.ceil(remainingMs / 1000), data.durationSeconds >= 3600);
  const caption = phase === "running" && data.nextAt !== null
    ? i18n.formatDate(data.nextAt, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    : phase === "stopped" ? null : i18n.text(messages[phase]);
  return <svg viewBox="0 0 100 100" role="timer" aria-label={`${i18n.text(messages[phase])} ${digits}`}
    className={cn("aspect-square h-full max-h-full max-w-full transition-colors", ringTone[phase])}>
    <circle cx={50} cy={50} r={45} fill="none" stroke="currentColor" strokeWidth={3} className="opacity-15" />
    <circle cx={50} cy={50} r={45} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"
      pathLength={100} strokeDasharray="100 100" strokeDashoffset={100 - fraction * 100} transform="rotate(-90 50 50)"
      className={cn(fraction === 0 && "opacity-0", !reduced && "transition-[stroke-dashoffset] duration-1000 ease-linear")} />
    {data.repeat && <Repeat x={44} y={22} width={12} height={12} strokeWidth={2.5} className="text-muted-foreground" aria-hidden />}
    <text x={50} y={50} textAnchor="middle" dominantBaseline="central" fill="currentColor"
      className="text-foreground [font-variant-numeric:tabular-nums]" fontWeight={300} letterSpacing={-0.5}
      fontSize={data.durationSeconds >= 3600 ? 17 : 22}>{digits}</text>
    {caption && <g className="text-muted-foreground" fill="currentColor">
      {phase === "running" && <Bell x={34} y={65.5} width={7} height={7} strokeWidth={2.5} fill="none" stroke="currentColor" aria-hidden />}
      <text x={phase === "running" ? 43 : 50} y={69} textAnchor={phase === "running" ? "start" : "middle"} dominantBaseline="central"
        fontSize={7} className="[font-variant-numeric:tabular-nums]">{caption}</text>
    </g>}
  </svg>;
}

function TimerFront({ data, disabled, error, onControl, onEdit }: {
  data: TimerData; disabled: boolean; error: string | null; onControl(action: "start" | "pause" | "reset"): void; onEdit(): void;
}) {
  const i18n = useI18n(), phase = phaseOf(data), running = phase === "running";
  const startable = running || data.message.trim().length > 0;
  return <div className="flex h-full flex-col items-center gap-3 p-4">
    <div className="flex min-h-0 w-full flex-1 items-center justify-center"><Ring data={data} phase={phase} /></div>
    <div className="flex shrink-0 items-center gap-4">
      <IconButton size="icon-lg" variant="secondary" className="rounded-full" label={i18n.text(messages.reset)}
        disabled={disabled || phase === "stopped"} onClick={() => onControl("reset")}><RotateCcw /></IconButton>
      <Button size="icon-lg" className="size-14 rounded-full [&_svg:not([class*='size-'])]:size-6" disabled={disabled || !startable}
        aria-label={i18n.text(running ? messages.pause : messages.start)} onClick={() => onControl(running ? "pause" : "start")}>
        {running ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="translate-x-0.5" />}
      </Button>
      <IconButton size="icon-lg" variant="secondary" className="rounded-full" label={i18n.text(running ? messages.timerRunning : messages.edit)}
        disabled={disabled || running} onClick={onEdit}><Pencil /></IconButton>
    </div>
    <div className="flex w-full shrink-0 justify-center text-center">
      <MessageLine message={data.message} editable={!disabled && !running} onEdit={onEdit} />
    </div>
    <ScheduleError error={error} />
  </div>;
}

function TimerBack({ value, onChange, disabled, error, onSubmit, onCancel }: {
  value: TimerSettings; onChange(value: TimerSettings): void; disabled: boolean; error: string | null; onSubmit(): void; onCancel(): void;
}) {
  const i18n = useI18n();
  const hours = Math.floor(value.durationSeconds / 3600), minutes = Math.floor(value.durationSeconds / 60) % 60, seconds = value.durationSeconds % 60;
  const set = (h: number, m: number, s: number) => onChange({ ...value, durationSeconds: h * 3600 + m * 60 + s });
  const separator = <span aria-hidden className="text-xl font-light text-muted-foreground">:</span>;
  return <form className="flex h-full flex-col gap-3 overflow-auto p-4" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <div role="group" aria-label={i18n.text(messages.duration)} className="flex shrink-0 items-center justify-center gap-1">
      <WheelPicker className="w-16" count={24} value={hours} label={i18n.text(messages.hours)} disabled={disabled} onValueChange={h => set(h, minutes, seconds)} />
      {separator}
      <WheelPicker className="w-16" count={60} value={minutes} format={pad2} label={i18n.text(messages.minutes)} disabled={disabled} onValueChange={m => set(hours, m, seconds)} />
      {separator}
      <WheelPicker className="w-16" count={60} value={seconds} format={pad2} label={i18n.text(messages.seconds)} disabled={disabled} onValueChange={s => set(hours, minutes, s)} />
    </div>
    <Toggle size="sm" variant="outline" className="shrink-0 self-center rounded-full px-3" disabled={disabled}
      pressed={value.repeat} onPressedChange={repeat => onChange({ ...value, repeat })}>
      <Repeat />{i18n.text(messages.repeat)}
    </Toggle>
    <MessageInput value={value.message} disabled={disabled} onChange={message => onChange({ ...value, message })} />
    <ScheduleError error={error} />
    <BackFooter disabled={disabled} canSubmit={timerSettingsSchema.safeParse(value).success} onCancel={onCancel} />
  </form>;
}

const settingsOf = ({ durationSeconds, repeat, message }: TimerSettings): TimerSettings => ({ durationSeconds, repeat, message });

export function TimerCard({ data }: { data: TimerData | null }) {
  const i18n = useI18n(), { object, disabled, error, run } = useScheduleAction();
  // The draft outlives the editing flag so the back keeps its content while turning away.
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState<TimerSettings | null>(null);
  if (!data) return <p className="type-caption p-3">{i18n.text(messages.unavailable)}</p>;
  const value = draft ?? settingsOf(data);
  return <FlipCard flipped={editing}
    front={<TimerFront data={data} disabled={disabled} error={editing ? null : error}
      onControl={action => { void run(() => object.invoke(ControlTimer, { action })); }}
      onEdit={() => { setDraft(settingsOf(data)); setEditing(true); }} />}
    back={<TimerBack value={value} onChange={setDraft} disabled={disabled || !editing} error={editing ? error : null}
      onCancel={() => setEditing(false)}
      onSubmit={async () => { if (await run(() => object.invoke(ConfigureTimer, value))) setEditing(false); }} />} />;
}
