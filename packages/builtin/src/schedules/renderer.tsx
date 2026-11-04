import { useEffect, useId, useState } from "react";
import { AlarmClock, Pause, Pencil, Play, RotateCcw } from "lucide-react";
import { cardRenderer, creationEntry, useI18n, useRendererObject,
  type CreationInputProps, type RendererModule, type RendererReceipt } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Field, FieldLabel, FieldSet } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Timer as TimerIcon } from "lucide-react";
import { commonMessages } from "../messages/common";
import { commonMessages as uiMessages } from "@asterism-app/ui/messages/common";
import { scheduleMessages as messages } from "../messages/schedules";
import { CreationForm } from "../shared/creation-form";
import { scheduleCard as appearance } from "../shared/card-appearance";
import { Alarm, AlarmView, ConfigureAlarm, ConfigureTimer, ControlTimer, CreateAlarm, CreateTimer, SetAlarmEnabled, Timer, TimerView,
  alarmSettingsSchema, timerSettingsSchema, type AlarmData, type AlarmSettings, type TimerData, type TimerSettings } from "./contract";
import { AlarmFields, TimerFields } from "./fields";

const defaultTimer: TimerSettings = { durationSeconds: 1800, repeat: false, message: "" };
const defaultAlarm: AlarmSettings = { time: "07:30", date: null, weekdays: [], message: "" };
const timerSettings = ({ durationSeconds, repeat, message }: TimerSettings): TimerSettings => ({ durationSeconds, repeat, message });
const alarmSettings = ({ time, date, weekdays, message }: AlarmSettings): AlarmSettings => ({ time, date, weekdays, message });

function TimerCreation({ initialInput, busy, resolve, cancel }: CreationInputProps<Partial<TimerSettings & { title: string }>>) {
  const i18n = useI18n(), id = useId();
  const [title, setTitle] = useState(initialInput?.title ?? i18n.text(messages.timer));
  const [settings, setSettings] = useState<TimerSettings>(() => timerSettings({ ...defaultTimer, ...initialInput }));
  return <CreationForm busy={busy} disabled={!title.trim() || !timerSettingsSchema.safeParse(settings).success} onCancel={cancel}
    onSubmit={() => resolve({ title: title.trim(), ...settings })}>
    <Field><FieldLabel htmlFor={id}>{i18n.text(commonMessages.name)}</FieldLabel>
      <Input id={id} autoFocus required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></Field>
    <TimerFields value={settings} onChange={setSettings} />
  </CreationForm>;
}

function AlarmCreation({ initialInput, busy, resolve, cancel }: CreationInputProps<Partial<AlarmSettings & { title: string }>>) {
  const i18n = useI18n(), id = useId();
  const [title, setTitle] = useState(initialInput?.title ?? i18n.text(messages.alarm));
  const [settings, setSettings] = useState<AlarmSettings>(() => alarmSettings({ ...defaultAlarm, ...initialInput }));
  return <CreationForm busy={busy} disabled={!title.trim() || !alarmSettingsSchema.safeParse(settings).success} onCancel={cancel}
    onSubmit={() => resolve({ title: title.trim(), ...settings })}>
    <Field><FieldLabel htmlFor={id}>{i18n.text(commonMessages.name)}</FieldLabel>
      <Input id={id} autoFocus required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></Field>
    <AlarmFields value={settings} onChange={setSettings} />
  </CreationForm>;
}

function useScheduleAction() {
  const object = useRendererObject(), i18n = useI18n();
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const disabled = pending || !object.view.ready;
  const run = async (work: () => Promise<RendererReceipt>) => {
    if (disabled) return false;
    setPending(true); setError(null);
    try {
      const result = await work();
      if (!result.ok) { setError(result.error.display ? i18n.text(result.error.display) : i18n.text(messages.failed)); return false; }
      return true;
    } catch (error) {
      console.error("Schedule update failed.", error);
      setError(i18n.text(messages.failed));
      return false;
    } finally { setPending(false); }
  };
  return { object, disabled, error, run };
}

function Remaining({ data }: { data: TimerData }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (data.nextAt === null) return;
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [data.nextAt]);
  const seconds = Math.ceil((data.nextAt === null ? data.remainingMs : Math.max(0, data.nextAt - now)) / 1000);
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return <span className="font-mono text-3xl tabular-nums">{parts.map(value => String(value).padStart(2, "0")).join(":")}</span>;
}

function TimerCard({ data }: { data: TimerData | null }) {
  const i18n = useI18n(), { object, disabled, error, run } = useScheduleAction();
  const [editing, setEditing] = useState<TimerSettings | null>(null);
  if (!data) return <p className="type-caption p-3">{i18n.text(messages.unavailable)}</p>;
  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
    {editing ? <form className="flex flex-col gap-3" onSubmit={async event => {
      event.preventDefault();
      if (timerSettingsSchema.safeParse(editing).success && await run(() => object.invoke(ConfigureTimer, editing))) setEditing(null);
    }}>
      <FieldSet disabled={disabled}><TimerFields value={editing} onChange={setEditing} /></FieldSet>
      <div className="flex gap-2">
        <Button size="sm" disabled={disabled || !timerSettingsSchema.safeParse(editing).success}>{i18n.text(messages.save)}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setEditing(null)}>{i18n.text(uiMessages.cancel)}</Button>
      </div>
    </form> : <>
      <div className="flex items-center justify-between gap-2">
        <Badge variant={data.nextAt === null ? "secondary" : "default"}>
          {i18n.text(data.nextAt !== null ? messages.running : data.remainingMs === 0 ? messages.finished : messages.paused)}
        </Badge>
        <IconButton size="icon-xs" label={i18n.text(messages.edit)} disabled={disabled} onClick={() => setEditing(timerSettings(data))}><Pencil /></IconButton>
      </div>
      <Remaining data={data} />
      {data.nextAt !== null && <p className="type-caption text-muted-foreground">{i18n.formatDate(data.nextAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={disabled} onClick={() => { void run(() => object.invoke(ControlTimer, { action: data.nextAt === null ? "start" : "pause" })); }}>
          {data.nextAt === null ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
          {i18n.text(data.nextAt === null ? messages.start : messages.pause)}
        </Button>
        <IconButton size="icon-sm" label={i18n.text(messages.reset)} disabled={disabled}
          onClick={() => { void run(() => object.invoke(ControlTimer, { action: "reset" })); }}><RotateCcw /></IconButton>
        {data.repeat && <Badge variant="outline">{i18n.text(messages.repeat)}</Badge>}
      </div>
      <p className="type-body whitespace-pre-wrap break-words">{data.message}</p>
    </>}
    {error && <p role="alert" className="type-caption text-destructive">{error}</p>}
  </div>;
}

function AlarmCard({ data }: { data: AlarmData | null }) {
  const i18n = useI18n(), { object, disabled, error, run } = useScheduleAction();
  const [editing, setEditing] = useState<AlarmSettings | null>(null);
  if (!data) return <p className="type-caption p-3">{i18n.text(messages.unavailable)}</p>;
  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
    {editing ? <form className="flex flex-col gap-3" onSubmit={async event => {
      event.preventDefault();
      if (alarmSettingsSchema.safeParse(editing).success && await run(() => object.invoke(ConfigureAlarm, editing))) setEditing(null);
    }}>
      <FieldSet disabled={disabled}><AlarmFields value={editing} onChange={setEditing} /></FieldSet>
      <div className="flex gap-2">
        <Button size="sm" disabled={disabled || !alarmSettingsSchema.safeParse(editing).success}>{i18n.text(messages.save)}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setEditing(null)}>{i18n.text(uiMessages.cancel)}</Button>
      </div>
    </form> : <>
      <div className="flex items-center justify-between gap-2">
        <Switch aria-label={i18n.text(messages.enabled)} disabled={disabled} checked={data.enabled}
          onCheckedChange={enabled => { void run(() => object.invoke(SetAlarmEnabled, { enabled })); }} />
        <IconButton size="icon-xs" label={i18n.text(messages.edit)} disabled={disabled} onClick={() => setEditing(alarmSettings(data))}><Pencil /></IconButton>
      </div>
      <span className="font-mono text-3xl tabular-nums">{data.time}</span>
      <p className="type-caption text-muted-foreground">
        {data.weekdays.length ? [...new Set(data.weekdays)].sort((a, b) => (a || 7) - (b || 7))
          .map(day => i18n.formatDate(new Date(2024, 0, 7 + day).getTime(), { weekday: "short" })).join(" · ")
          : i18n.text(messages.once)}
      </p>
      <p className="type-caption text-muted-foreground">{data.nextAt === null ? i18n.text(messages.off)
        : i18n.formatDate(data.nextAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
      <p className="type-body whitespace-pre-wrap break-words">{data.message}</p>
    </>}
    {error && <p role="alert" className="type-caption text-destructive">{error}</p>}
  </div>;
}

export default {
  resources: [
    { kind: Timer.kind, label: messages.timer, icon: <TimerIcon className="size-4" />, card: appearance },
    { kind: Alarm.kind, label: messages.alarm, icon: <AlarmClock className="size-4" />, card: appearance },
  ],
  cards: [cardRenderer(TimerView, { ...appearance, Body: TimerCard }), cardRenderer(AlarmView, { ...appearance, Body: AlarmCard })],
  creations: [
    creationEntry(CreateTimer, { id: CreateTimer.id, label: messages.timer, icon: <TimerIcon className="size-4" />,
      group: "resources", InputView: TimerCreation, triggers: { menu: {} } }),
    creationEntry(CreateAlarm, { id: CreateAlarm.id, label: messages.alarm, icon: <AlarmClock className="size-4" />,
      group: "resources", InputView: AlarmCreation, triggers: { menu: {} } }),
  ],
  tools: [],
} satisfies RendererModule;
