import { nanoid } from "nanoid";
import { Agent, SubmitAgentInput } from "@asterism-app/builtin-api/contracts";
import { ResourcePresenceChanged, SystemResumed, type Json } from "@asterism-app/sdk/contracts";
import { defineModule, implementAction, implementCreation, implementResource, implementTool, PluginApiError,
  type CallResult, type Lifetime, type ObjectExecutor, type ObjectReader, type PluginContext, type ResourceRef, type ResourceSnapshot } from "@asterism-app/sdk/runtime";
import { scheduleCard } from "../shared/card-appearance.ts";
import { Alarm, AlarmState, AlarmView, ConfigureAlarm, ConfigureTimer, ControlTimer, CreateAlarm, CreateTimer,
  SetAlarmEnabled, Timer, TimerState, TimerView, AlarmGet, AlarmSet, AlarmEnable, AlarmDisable,
  TimerGet, TimerSet, TimerStart, TimerPause, TimerReset, type AlarmSettings, type TimerSettings } from "./contract.ts";
import { configureTimer, controlTimer, expireAlarm, expireTimer, normalizeWeekdays, setAlarmEnabled } from "./time.ts";
import { planWakeup } from "./deadlines.ts";
import { scheduleMessages as messages } from "../messages/schedules.ts";

function requireState<T>(state: T | null): T {
  if (state === null) throw new PluginApiError("unavailable", "The schedule state is unavailable.");
  return state;
}

/** A trigger without a message would deliver nothing; activation requires one. */
function requireMessage(message: string): void {
  if (!message.trim()) throw new PluginApiError("conflict", "Set a non-empty message before activating the schedule.", undefined, messages.messageRequired);
}

async function scheduleResult<T extends Json>(signal: AbortSignal, work: () => T): Promise<CallResult<T>> {
  try {
    signal.throwIfAborted();
    return { kind: "succeeded", data: work() };
  } catch (error) {
    if (signal.aborted) return { kind: "cancelled", message: "The schedule operation was cancelled before completion." };
    if (error instanceof PluginApiError) return { kind: "rejected", error: { code: error.reason ?? error.code, message: error.message } };
    throw error;
  }
}

/** State advances before independent submissions; recipient execution and delivery outcomes do not control the schedule. */
function deliver(plugin: PluginContext, source: ResourceSnapshot, recipients: readonly ResourceSnapshot[], message: string): void {
  for (const recipient of recipients) {
    if (recipient.ref.kind !== Agent.kind) continue;
    plugin.tasks.start(`schedule:${source.ref.id}:${nanoid(16)}`, signal =>
      plugin.session(recipient.ref.sessionId).invoke(SubmitAgentInput, recipient.ref, {
        submissionId: nanoid(16), mode: "steer", parts: [{ kind: "text", text: message }],
        sender: { kind: "event", resource: { ...source.ref }, name: source.title },
      }, { signal }), { object: source.ref, affectsHistory: false });
  }
}

/** One backend timeout waits for the earliest deadline across all attached schedules. */
export default defineModule(plugin => {
  const resources = new Map<string, { ref: ResourceRef; nextAt: number | null }>();
  let clock: ReturnType<typeof setTimeout> | undefined;
  let waitingFor: number | null = null;
  const rearm = () => {
    const { nextAt, delayMs } = planWakeup(resources.values(), Date.now());
    if (clock !== undefined && waitingFor === nextAt) return;
    if (clock !== undefined) clearTimeout(clock);
    clock = undefined;
    waitingFor = nextAt;
    if (delayMs !== null) {
      clock = setTimeout(wake, delayMs);
      clock.unref();
    }
  };
  const update = (ref: ResourceRef, nextAt: number | null) => {
    resources.set(ref.id, { ref, nextAt });
    rearm();
  };
  const attach = (_data: object, object: ObjectReader, lifetime: Lifetime) => {
    const nextAt = object.ref.kind === Timer.kind
      ? requireState(object.get(TimerState)).nextAt : requireState(object.get(AlarmState)).nextAt;
    update(object.ref, nextAt);
    lifetime.signal.addEventListener("abort", () => { resources.delete(object.ref.id); rearm(); }, { once: true });
  };
  function wake() {
    if (clock !== undefined) clearTimeout(clock);
    clock = undefined;
    waitingFor = null;
    const now = Date.now();
    const { due } = planWakeup(resources.values(), now);
    for (const { ref } of due) {
      // A failed occurrence leaves scheduling stopped for this resource; other resources keep their deadlines.
      resources.set(ref.id, { ref, nextAt: null });
      try {
        const snapshot = plugin.session(ref.sessionId).snapshot();
        const source = snapshot.resources.all().find(resource => resource.ref.id === ref.id);
        if (!source) continue;
        if (ref.kind === Timer.kind) {
          const object = plugin.object(ref.sessionId, Timer, ref.id);
          const state = requireState(object.get(TimerState)), next = expireTimer(state, now);
          if (!next) { resources.set(ref.id, { ref, nextAt: state.nextAt }); continue; }
          object.commit(writer => { writer.set(TimerState, next); });
          resources.set(ref.id, { ref, nextAt: next.nextAt });
          deliver(plugin, source, snapshot.resources.linkedTo(ref), state.message);
        } else {
          const object = plugin.object(ref.sessionId, Alarm, ref.id);
          const state = requireState(object.get(AlarmState)), next = expireAlarm(state, now);
          if (!next) { resources.set(ref.id, { ref, nextAt: state.nextAt }); continue; }
          object.commit(writer => { writer.set(AlarmState, next); });
          resources.set(ref.id, { ref, nextAt: next.nextAt });
          deliver(plugin, source, snapshot.resources.linkedTo(ref), state.message);
        }
      } catch (error) {
        plugin.log.error(`Schedule ${ref.id} could not be processed.`, error);
      }
    }
    rearm();
  }
  plugin.ipc.events.subscribe(SystemResumed, { signal: plugin.lifetime.signal }, wake);
  plugin.ipc.events.subscribe(ResourcePresenceChanged, { signal: plugin.lifetime.signal }, ({ data }) => {
    let removed = false;
    for (const id of data.disappeared) removed = resources.delete(id) || removed;
    if (removed) rearm();
  });
  plugin.lifetime.defer(() => { if (clock !== undefined) clearTimeout(clock); resources.clear(); });
  const saveTimerSettings = (object: ObjectExecutor, settings: TimerSettings) => {
    if (requireState(object.get(TimerState)).nextAt !== null)
      throw new PluginApiError("conflict", "Pause or reset the timer before configuring it.", undefined, messages.timerRunning);
    const next = configureTimer(settings);
    object.commit(writer => { writer.set(TimerState, next); });
    update(object.ref, next.nextAt);
    return next;
  };
  const changeTimer = (object: ObjectExecutor, action: "start" | "pause" | "reset") => {
    const state = requireState(object.get(TimerState));
    if (action === "start" && state.nextAt === null) requireMessage(state.message);
    const next = controlTimer(state, action, Date.now());
    object.commit(writer => { writer.set(TimerState, next); });
    update(object.ref, next.nextAt);
    return next;
  };
  const saveAlarmSettings = (object: ObjectExecutor, { weekdays, ...settings }: AlarmSettings) => {
    const state = requireState(object.get(AlarmState));
    if (state.enabled)
      throw new PluginApiError("conflict", "Turn off the alarm before configuring it.", undefined, messages.alarmEnabled);
    const next = { ...state, ...settings, weekdays: normalizeWeekdays(weekdays) };
    object.commit(writer => { writer.set(AlarmState, next); });
    return next;
  };
  const changeAlarmEnabled = (object: ObjectExecutor, enabled: boolean) => {
    const state = requireState(object.get(AlarmState));
    if (enabled && !state.enabled) requireMessage(state.message);
    const next = setAlarmEnabled(state, enabled, Date.now());
    object.commit(writer => { writer.set(AlarmState, next); });
    update(object.ref, next.nextAt);
    return next;
  };
  return {
    resources: [
      implementResource(Timer, TimerView, {
        card: scheduleCard, links: { receive: true }, attach,
        creation: implementCreation(CreateTimer, {
          create({ title, ...settings }, object) {
            object.commit(writer => { writer.set(TimerState, configureTimer(settings)); });
            return { title: title ?? "Timer", data: {} };
          },
        }),
        project: (_data, object) => object.get(TimerState),
        inspect: async (_data, object) => object.get(TimerState),
        actions: [
          implementAction(ConfigureTimer, { async execute(settings, object) { saveTimerSettings(object, settings); } }),
          implementAction(ControlTimer, { async execute({ action }, object) { changeTimer(object, action); } }),
        ],
      }),
      implementResource(Alarm, AlarmView, {
        card: scheduleCard, links: { receive: true }, attach,
        creation: implementCreation(CreateAlarm, {
          create({ title, weekdays, ...settings }, object) {
            object.commit(writer => { writer.set(AlarmState, { ...settings, weekdays: normalizeWeekdays(weekdays), enabled: false, nextAt: null }); });
            return { title: title ?? "Alarm", data: {} };
          },
        }),
        project: (_data, object) => object.get(AlarmState),
        inspect: async (_data, object) => object.get(AlarmState),
        actions: [
          implementAction(ConfigureAlarm, { async execute(settings, object) { saveAlarmSettings(object, settings); } }),
          implementAction(SetAlarmEnabled, { async execute({ enabled }, object) { changeAlarmEnabled(object, enabled); } }),
        ],
      }),
    ],
    tools: [
      implementTool(TimerGet, { async call(_data, _target, _args, { object, signal }) {
        return scheduleResult(signal, () => requireState(object.get(TimerState)));
      } }),
      implementTool(TimerSet, { async call(_data, _target, args, { object, signal }) {
        return scheduleResult(signal, () => saveTimerSettings(object, args));
      } }),
      implementTool(TimerStart, { async call(_data, _target, _args, { object, signal }) {
        return scheduleResult(signal, () => changeTimer(object, "start"));
      } }),
      implementTool(TimerPause, { async call(_data, _target, _args, { object, signal }) {
        return scheduleResult(signal, () => changeTimer(object, "pause"));
      } }),
      implementTool(TimerReset, { async call(_data, _target, _args, { object, signal }) {
        return scheduleResult(signal, () => changeTimer(object, "reset"));
      } }),
      implementTool(AlarmGet, { async call(_data, _target, _args, { object, signal }) {
        return scheduleResult(signal, () => requireState(object.get(AlarmState)));
      } }),
      implementTool(AlarmSet, { async call(_data, _target, args, { object, signal }) {
        return scheduleResult(signal, () => saveAlarmSettings(object, args));
      } }),
      implementTool(AlarmEnable, { async call(_data, _target, _args, { object, signal }) {
        return scheduleResult(signal, () => changeAlarmEnabled(object, true));
      } }),
      implementTool(AlarmDisable, { async call(_data, _target, _args, { object, signal }) {
        return scheduleResult(signal, () => changeAlarmEnabled(object, false));
      } }),
    ],
  };
});
