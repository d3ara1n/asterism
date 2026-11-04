import { useId } from "react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Field, FieldGroup, FieldLabel } from "@asterism-app/ui/ui/field";
import { Input } from "@asterism-app/ui/ui/input";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { Switch } from "@asterism-app/ui/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { scheduleMessages as messages } from "../messages/schedules";
import type { AlarmSettings, TimerSettings } from "./contract";

function MessageField({ value, onChange }: { value: string; onChange(value: string): void }) {
  const i18n = useI18n(), id = useId();
  return <Field>
    <FieldLabel htmlFor={id}>{i18n.text(messages.message)}</FieldLabel>
    <Textarea id={id} required rows={3} className="field-sizing-fixed" value={value} onChange={event => onChange(event.target.value)} />
  </Field>;
}

export function TimerFields({ value, onChange }: { value: TimerSettings; onChange(value: TimerSettings): void }) {
  const i18n = useI18n(), prefix = useId();
  const hours = Math.floor(value.durationSeconds / 3600), minutes = Math.floor(value.durationSeconds / 60) % 60, seconds = value.durationSeconds % 60;
  return <FieldGroup>
    <div className="grid grid-cols-3 gap-2">
      {([
        ["hours", hours, undefined, (number: number) => number * 3600 + minutes * 60 + seconds],
        ["minutes", minutes, 59, (number: number) => hours * 3600 + number * 60 + seconds],
        ["seconds", seconds, 59, (number: number) => hours * 3600 + minutes * 60 + number],
      ] as const).map(([unit, number, max, duration]) => <Field key={unit}>
        <FieldLabel htmlFor={`${prefix}-${unit}`}>{i18n.text(messages[unit])}</FieldLabel>
        <Input id={`${prefix}-${unit}`} type="number" min={0} max={max} step={1} value={number}
          onChange={event => onChange({ ...value, durationSeconds: duration(Number(event.target.value)) })} />
      </Field>)}
    </div>
    <Field orientation="horizontal">
      <FieldLabel htmlFor={`${prefix}-repeat`}>{i18n.text(messages.repeat)}</FieldLabel>
      <Switch id={`${prefix}-repeat`} checked={value.repeat} onCheckedChange={repeat => onChange({ ...value, repeat })} />
    </Field>
    <MessageField value={value.message} onChange={message => onChange({ ...value, message })} />
  </FieldGroup>;
}

export function AlarmFields({ value, onChange }: { value: AlarmSettings; onChange(value: AlarmSettings): void }) {
  const i18n = useI18n(), prefix = useId();
  return <FieldGroup>
    <Field>
      <FieldLabel htmlFor={`${prefix}-time`}>{i18n.text(messages.time)}</FieldLabel>
      <Input id={`${prefix}-time`} type="time" required value={value.time} onChange={event => onChange({ ...value, time: event.target.value })} />
    </Field>
    <Field>
      <FieldLabel id={`${prefix}-repeat`}>{i18n.text(messages.repeat)}</FieldLabel>
      <ToggleGroup type="multiple" size="sm" variant="outline" aria-labelledby={`${prefix}-repeat`}
        value={value.weekdays.map(String)} onValueChange={days => onChange({ ...value, weekdays: days.map(Number), date: null })}>
        {[1, 2, 3, 4, 5, 6, 0].map(day => <ToggleGroupItem key={day} value={String(day)} className="px-2"
          aria-label={i18n.formatDate(new Date(2024, 0, 7 + day).getTime(), { weekday: "long" })}>
          {i18n.formatDate(new Date(2024, 0, 7 + day).getTime(), { weekday: "narrow" })}
        </ToggleGroupItem>)}
      </ToggleGroup>
    </Field>
    {!value.weekdays.length && <Field>
      <FieldLabel htmlFor={`${prefix}-date`}>{i18n.text(messages.date)}</FieldLabel>
      <Input id={`${prefix}-date`} type="date" value={value.date ?? ""} aria-label={i18n.text(messages.date)}
        placeholder={i18n.text(messages.nextOccurrence)} onChange={event => onChange({ ...value, date: event.target.value || null })} />
    </Field>}
    <MessageField value={value.message} onChange={message => onChange({ ...value, message })} />
  </FieldGroup>;
}
