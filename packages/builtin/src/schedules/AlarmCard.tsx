import { useState } from "react";
import { Bell, BellOff, Pencil } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { cn } from "@asterism-app/ui/utils";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Switch } from "@asterism-app/ui/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { WheelPicker } from "@asterism-app/ui/ui/wheel-picker";
import { scheduleMessages as messages } from "../messages/schedules";
import { ConfigureAlarm, SetAlarmEnabled, alarmSettingsSchema, type AlarmData, type AlarmSettings } from "./contract";
import { FlipCard } from "./FlipCard";
import { BackFooter, MessageInput, MessageLine, ScheduleError, pad2, useScheduleAction, weekOrder, weekdayDate } from "./shared";

function AlarmFront({ data, disabled, error, onEnabled, onEdit }: {
  data: AlarmData; disabled: boolean; error: string | null; onEnabled(enabled: boolean): void; onEdit(): void;
}) {
  const i18n = useI18n();
  const hasMessage = data.message.trim().length > 0;
  return <div className="relative flex h-full flex-col gap-3 p-4">
    {/* A soft glow marks an armed alarm; the face dims when it is off. */}
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 transition-opacity duration-500",
      data.enabled ? "opacity-100" : "opacity-0")}
      style={{ background: "radial-gradient(ellipse at 50% 35%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)" }} />
    <div className="relative flex shrink-0 items-center justify-between gap-2">
      <span className={cn("type-caption flex min-w-0 items-center gap-1.5 tabular-nums", data.enabled && "text-foreground")}>
        {data.enabled && data.nextAt !== null
          ? <><Bell className="size-3.5 shrink-0" />
            <span className="truncate">{i18n.formatDate(data.nextAt, { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span></>
          : <BellOff className="size-3.5 shrink-0" aria-label={i18n.text(messages.stopped)} />}
      </span>
      <Switch className="origin-right scale-150" aria-label={i18n.text(messages.enabled)} checked={data.enabled}
        disabled={disabled || (!data.enabled && !hasMessage)} onCheckedChange={onEnabled} />
    </div>
    <div className="relative flex min-h-0 flex-1 items-center justify-center [container-type:size]">
      <span className={cn("font-extralight leading-none tracking-tight tabular-nums transition-colors duration-500 text-[min(42cqw,80cqh)]",
        data.enabled ? "text-foreground" : "text-muted-foreground/60")}>{data.time}</span>
    </div>
    <div className="relative flex shrink-0 justify-center gap-1.5" role="list" aria-label={i18n.text(messages.weekdays)}>
      {weekOrder.map(day => {
        const selected = data.weekdays.includes(day);
        return <span key={day} role="listitem" aria-label={i18n.formatDate(weekdayDate(day), { weekday: "long" })}
          aria-current={selected || undefined}
          className={cn("flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
            selected ? data.enabled ? "bg-primary text-primary-foreground" : "bg-muted text-foreground" : "text-muted-foreground/50")}>
          {i18n.formatDate(weekdayDate(day), { weekday: "narrow" })}
        </span>;
      })}
    </div>
    <div className="relative flex shrink-0 items-center gap-2">
      <MessageLine message={data.message} editable={!disabled && !data.enabled} onEdit={onEdit} />
      <IconButton size="icon-sm" className="rounded-full" label={i18n.text(data.enabled ? messages.alarmEnabled : messages.edit)}
        disabled={disabled || data.enabled} onClick={onEdit}><Pencil /></IconButton>
    </div>
    <ScheduleError error={error} />
  </div>;
}

function AlarmBack({ value, onChange, disabled, error, onSubmit, onCancel }: {
  value: AlarmSettings; onChange(value: AlarmSettings): void; disabled: boolean; error: string | null; onSubmit(): void; onCancel(): void;
}) {
  const i18n = useI18n();
  const [hours, minutes] = value.time.split(":").map(Number) as [number, number];
  const setTime = (h: number, m: number) => onChange({ ...value, time: `${pad2(h)}:${pad2(m)}` });
  return <form className="flex h-full flex-col gap-3 overflow-auto p-4" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <div role="group" aria-label={i18n.text(messages.time)} className="flex shrink-0 items-center justify-center gap-1">
      <WheelPicker className="w-20" count={24} value={hours} format={pad2} label={i18n.text(messages.hours)} disabled={disabled} onValueChange={h => setTime(h, minutes)} />
      <span aria-hidden className="text-xl font-light text-muted-foreground">:</span>
      <WheelPicker className="w-20" count={60} value={minutes} format={pad2} label={i18n.text(messages.minutes)} disabled={disabled} onValueChange={m => setTime(hours, m)} />
    </div>
    <ToggleGroup type="multiple" className="shrink-0 justify-center gap-1.5" aria-label={i18n.text(messages.weekdays)} disabled={disabled}
      value={value.weekdays.map(String)}
      // At least one weekday stays selected: an alarm always repeats.
      onValueChange={days => { if (days.length) onChange({ ...value, weekdays: days.map(Number).sort((a, b) => a - b) }); }}>
      {weekOrder.map(day => <ToggleGroupItem key={day} value={String(day)}
        aria-label={i18n.formatDate(weekdayDate(day), { weekday: "long" })}
        className="size-8 min-w-0 flex-none rounded-full! p-0 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
        {i18n.formatDate(weekdayDate(day), { weekday: "narrow" })}
      </ToggleGroupItem>)}
    </ToggleGroup>
    <MessageInput value={value.message} disabled={disabled} onChange={message => onChange({ ...value, message })} />
    <ScheduleError error={error} />
    <BackFooter disabled={disabled} canSubmit={alarmSettingsSchema.safeParse(value).success} onCancel={onCancel} />
  </form>;
}

const settingsOf = ({ time, weekdays, message }: AlarmSettings): AlarmSettings => ({ time, weekdays, message });

export function AlarmCard({ data }: { data: AlarmData | null }) {
  const i18n = useI18n(), { object, disabled, error, run } = useScheduleAction();
  // The draft outlives the editing flag so the back keeps its content while turning away.
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState<AlarmSettings | null>(null);
  if (!data) return <p className="type-caption p-3">{i18n.text(messages.unavailable)}</p>;
  const value = draft ?? settingsOf(data);
  return <FlipCard flipped={editing}
    front={<AlarmFront data={data} disabled={disabled} error={editing ? null : error}
      onEnabled={enabled => { void run(() => object.invoke(SetAlarmEnabled, { enabled })); }}
      onEdit={() => { setDraft(settingsOf(data)); setEditing(true); }} />}
    back={<AlarmBack value={value} onChange={setDraft} disabled={disabled || !editing} error={editing ? error : null}
      onCancel={() => setEditing(false)}
      onSubmit={async () => { if (await run(() => object.invoke(ConfigureAlarm, value))) setEditing(false); }} />} />;
}
