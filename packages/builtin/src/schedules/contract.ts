import { z } from "zod";
import { defineAction, defineCreation, defineImplementation, defineTool, type Json, type ToolInput } from "@asterism-app/sdk/contracts";
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
}).describe("Complete countdown duration, repetition, and trigger message.");
export const alarmSettingsSchema = z.strictObject({
  time: timeSchema,
  weekdays: weekdaysSchema,
  message: messageSchema.describe("Message delivered to directly linked Agents when the alarm is due. Enabling requires a non-empty message."),
}).describe("Complete local clock time, repeating weekdays, and trigger message.");
export const Timer = builtin.resource("timer", z.object({}));
export const Alarm = builtin.resource("alarm", z.object({}));
/** nextAt is set only while the countdown runs; remainingMs is the countdown left when stopped. */
export const TimerState = builtin.data("timer.state", timerSettingsSchema.extend({
  nextAt: timestampSchema.nullable().describe("Expiration as Unix epoch milliseconds while running; null while stopped."),
  remainingMs: z.number().int().min(0).describe("Remaining milliseconds while stopped. While running, nextAt determines the remaining time."),
}));
/** nextAt is set only while the alarm is enabled. */
export const AlarmState = builtin.data("alarm.state", alarmSettingsSchema.extend({
  enabled: z.boolean(),
  nextAt: timestampSchema.nullable().describe("Next occurrence as Unix epoch milliseconds; null while disabled."),
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

const empty = z.strictObject({}).describe("No operation parameters.");
const timerResult = TimerState.schema.describe("Timer configuration, expiration deadline, and remaining duration while stopped.");
const alarmResult = AlarmState.schema.describe("Alarm configuration, enabled state, and next occurrence.");
function scheduleTool<A extends ToolInput, D extends Json>(
  resource: typeof Timer, name: string, description: string, args: z.ZodType<A>, result: z.ZodType<D>, effect: "read" | "write",
) {
  return defineImplementation({
    ...builtin.data(name.replace("_", "."), result), resource,
    tool: defineTool({ id: builtin.name(`tool.${name}`), name, description, guidelines: [], argsSchema: args }),
    targetSchema: z.null().describe("This resource's complete schedule."),
    effect, execution: effect === "read" ? "parallel" : "sequential",
  });
}
export const TimerGet = scheduleTool(Timer, "timer_get",
  "Read the timer's current configuration and countdown state.", empty, timerResult, "read");
export const TimerSet = scheduleTool(Timer, "timer_set",
  "Replace the stopped timer's complete configuration and restore its full duration. A running timer rejects configuration. The timer remains stopped.",
  timerSettingsSchema, timerResult, "write");
export const TimerStart = scheduleTool(Timer, "timer_start",
  "Start or resume the timer. A finished timer starts a full countdown; an already running timer keeps its deadline. Starting requires a non-empty message.",
  empty, timerResult, "write");
export const TimerPause = scheduleTool(Timer, "timer_pause",
  "Pause the timer and preserve its remaining duration.", empty, timerResult, "write");
export const TimerReset = scheduleTool(Timer, "timer_reset",
  "Stop the timer and restore its full configured duration.", empty, timerResult, "write");
export const AlarmGet = scheduleTool(Alarm, "alarm_get",
  "Read the alarm's current configuration, enabled state, and next occurrence.", empty, alarmResult, "read");
export const AlarmSet = scheduleTool(Alarm, "alarm_set",
  "Replace the disabled alarm's complete configuration. An enabled alarm rejects configuration. The alarm remains disabled.",
  alarmSettingsSchema, alarmResult, "write");
export const AlarmEnable = scheduleTool(Alarm, "alarm_enable",
  "Enable the alarm and select its next future local clock occurrence. Enabling requires a non-empty message.",
  empty, alarmResult, "write");
export const AlarmDisable = scheduleTool(Alarm, "alarm_disable",
  "Disable the alarm and clear its pending occurrence.", empty, alarmResult, "write");
export type TimerSettings = z.infer<typeof timerSettingsSchema>;
export type AlarmSettings = z.infer<typeof alarmSettingsSchema>;
export type TimerData = z.infer<typeof TimerState.schema>;
export type AlarmData = z.infer<typeof AlarmState.schema>;
