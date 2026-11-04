import { z } from "zod";
import { defineAction, defineCreation } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

/** The wheel editor covers 0–23 hours; longer countdowns are outside this resource's range. */
export const MAX_TIMER_SECONDS = 23 * 3600 + 59 * 60 + 59;
const timestampSchema = z.number().int().min(0).max(8_640_000_000_000_000);
const titleSchema = z.string().trim().min(1).max(160).optional().describe("Display title for the new resource.");
const messageSchema = z.string().max(4000);
const durationSchema = z.number().int().min(1).max(MAX_TIMER_SECONDS).describe("Countdown duration in seconds.");
const repeatSchema = z.boolean().describe("Start another full countdown after each trigger.");
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u).describe("Local clock time in HH:mm format.");
const weekdaysSchema = z.array(z.number().int().min(0).max(6)).min(1).max(7)
  .describe("Weekdays on which the alarm repeats: Sunday is 0, Saturday is 6.");

export const timerSettingsSchema = z.strictObject({
  durationSeconds: durationSchema,
  repeat: repeatSchema,
  message: messageSchema.describe("Message delivered to directly linked Agents when the timer expires. Starting requires a non-empty message."),
});
export const alarmSettingsSchema = z.strictObject({
  time: timeSchema,
  weekdays: weekdaysSchema,
  message: messageSchema.describe("Message delivered to directly linked Agents when the alarm is due. Enabling requires a non-empty message."),
});
export const Timer = builtin.resource("timer", z.object({}));
export const Alarm = builtin.resource("alarm", z.object({}));
/** nextAt is set only while the countdown runs; remainingMs is the countdown left when stopped. */
export const TimerState = builtin.data("timer.state", timerSettingsSchema.extend({
  nextAt: timestampSchema.nullable(),
  remainingMs: z.number().int().min(0),
}));
/** nextAt is set only while the alarm is enabled. */
export const AlarmState = builtin.data("alarm.state", alarmSettingsSchema.extend({
  enabled: z.boolean(),
  nextAt: timestampSchema.nullable(),
}));
export const TimerView = builtin.data("timer.card", TimerState.schema.nullable());
export const AlarmView = builtin.data("alarm.card", AlarmState.schema.nullable());
export const CreateTimer = defineCreation(Timer, {
  id: builtin.name("timer.create"),
  schema: z.strictObject({
    title: titleSchema,
    durationSeconds: durationSchema.default(1800),
    repeat: repeatSchema.default(false),
    message: messageSchema.default("").describe("Message delivered when the timer expires. Defaults to empty."),
  }).describe("A stopped countdown at its full duration."),
});
export const CreateAlarm = defineCreation(Alarm, {
  id: builtin.name("alarm.create"),
  schema: z.strictObject({
    title: titleSchema,
    time: timeSchema.default("07:30"),
    weekdays: weekdaysSchema.default([0, 1, 2, 3, 4, 5, 6]),
    message: messageSchema.default("").describe("Message delivered when the alarm is due. Defaults to empty."),
  }).describe("A disabled repeating alarm."),
});
/** Configuration requires a stopped timer and restores its full duration. */
export const ConfigureTimer = defineAction(Timer, { id: builtin.name("timer.configure"), schema: timerSettingsSchema });
export const ControlTimer = defineAction(Timer, {
  id: builtin.name("timer.control"), schema: z.strictObject({ action: z.enum(["start", "pause", "reset"]) }),
});
/** Configuration requires a disabled alarm. */
export const ConfigureAlarm = defineAction(Alarm, { id: builtin.name("alarm.configure"), schema: alarmSettingsSchema });
export const SetAlarmEnabled = defineAction(Alarm, {
  id: builtin.name("alarm.enable"), schema: z.strictObject({ enabled: z.boolean() }),
});
export type TimerSettings = z.infer<typeof timerSettingsSchema>;
export type AlarmSettings = z.infer<typeof alarmSettingsSchema>;
export type TimerData = z.infer<typeof TimerState.schema>;
export type AlarmData = z.infer<typeof AlarmState.schema>;
