import { z } from "zod";
import { defineAction, defineCreation } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

const messageSchema = z.string().refine(value => value.trim().length > 0, "Enter a message.");
const timestampSchema = z.number().int().min(0).max(8_640_000_000_000_000);
export const timerSettingsSchema = z.strictObject({
  durationSeconds: z.number().int().min(1).describe("Countdown duration in seconds."),
  repeat: z.boolean().default(false).describe("Start another full countdown after each trigger."),
  message: messageSchema.describe("Message delivered to directly linked Agents when the timer expires."),
});
export const alarmSettingsSchema = z.strictObject({
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u).describe("Local clock time in HH:mm format."),
  date: z.iso.date().nullable().default(null).describe("Local date for a one-time alarm; null selects the next occurrence."),
  weekdays: z.array(z.number().int().min(0).max(6)).default([])
    .describe("Repeating weekdays: Sunday is 0, Saturday is 6. Empty means one-time."),
  message: messageSchema.describe("Message delivered to directly linked Agents when the alarm is due."),
});
export const Timer = builtin.resource("timer", z.object({}));
export const Alarm = builtin.resource("alarm", z.object({}));
export const TimerState = builtin.data("timer.state", timerSettingsSchema.extend({
  nextAt: timestampSchema.nullable(),
  remainingMs: z.number().int().min(0),
}));
export const AlarmState = builtin.data("alarm.state", alarmSettingsSchema.extend({
  enabled: z.boolean(),
  nextAt: timestampSchema.nullable(),
}));
export const TimerView = builtin.data("timer.card", TimerState.schema.nullable());
export const AlarmView = builtin.data("alarm.card", AlarmState.schema.nullable());
export const CreateTimer = defineCreation(Timer, {
  id: builtin.name("timer.create"),
  schema: timerSettingsSchema.extend({ title: z.string().trim().min(1).max(160).default("Timer") }),
});
export const CreateAlarm = defineCreation(Alarm, {
  id: builtin.name("alarm.create"),
  schema: alarmSettingsSchema.extend({ title: z.string().trim().min(1).max(160).default("Alarm") }),
});
export const ConfigureTimer = defineAction(Timer, { id: builtin.name("timer.configure"), schema: timerSettingsSchema });
export const ControlTimer = defineAction(Timer, {
  id: builtin.name("timer.control"), schema: z.strictObject({ action: z.enum(["start", "pause", "reset"]) }),
});
export const ConfigureAlarm = defineAction(Alarm, { id: builtin.name("alarm.configure"), schema: alarmSettingsSchema });
export const SetAlarmEnabled = defineAction(Alarm, {
  id: builtin.name("alarm.enable"), schema: z.strictObject({ enabled: z.boolean() }),
});
export type TimerSettings = z.infer<typeof timerSettingsSchema>;
export type AlarmSettings = z.infer<typeof alarmSettingsSchema>;
export type TimerData = z.infer<typeof TimerState.schema>;
export type AlarmData = z.infer<typeof AlarmState.schema>;
