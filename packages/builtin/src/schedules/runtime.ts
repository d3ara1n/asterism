import { nanoid } from "nanoid";
import { Agent, SubmitAgentInput } from "@asterism-app/builtin-api/contracts";
import { ResourcePresenceChanged, SystemResumed } from "@asterism-app/sdk/contracts";
import { defineModule, implementAction, implementCreation, implementResource, PluginApiError,
  type Lifetime, type ObjectReader, type PluginContext, type ResourceRef, type ResourceSnapshot } from "@asterism-app/sdk/runtime";
import { scheduleCard } from "../shared/card-appearance.ts";
import { Alarm, AlarmState, AlarmView, ConfigureAlarm, ConfigureTimer, ControlTimer, CreateAlarm, CreateTimer,
  SetAlarmEnabled, Timer, TimerState, TimerView } from "./contract.ts";
import { configureAlarm, configureTimer, controlTimer, expireAlarm, expireTimer, nextAlarmAt } from "./time.ts";
import { planWakeup } from "./deadlines.ts";

function requireState<T>(state: T | null): T {
  if (state === null) throw new PluginApiError("unavailable", "The schedule state is unavailable.");
  return state;
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
  return {
    resources: [
      implementResource(Timer, TimerView, {
        card: scheduleCard, links: { receive: true }, attach,
        creation: implementCreation(CreateTimer, {
          create({ title, ...settings }, object) {
            object.commit(writer => { writer.set(TimerState, { ...settings,
              nextAt: Date.now() + settings.durationSeconds * 1000, remainingMs: settings.durationSeconds * 1000 }); });
            return { title, data: {} };
          },
        }),
        project: (_data, object) => object.get(TimerState),
        inspect: async (_data, object) => object.get(TimerState),
        actions: [
          implementAction(ConfigureTimer, { async execute(settings, object) {
            const next = configureTimer(requireState(object.get(TimerState)), settings, Date.now());
            object.commit(writer => { writer.set(TimerState, next); });
            update(object.ref, next.nextAt);
          } }),
          implementAction(ControlTimer, { async execute({ action }, object) {
            const next = controlTimer(requireState(object.get(TimerState)), action, Date.now());
            object.commit(writer => { writer.set(TimerState, next); });
            update(object.ref, next.nextAt);
          } }),
        ],
      }),
      implementResource(Alarm, AlarmView, {
        card: scheduleCard, links: { receive: true }, attach,
        creation: implementCreation(CreateAlarm, {
          create({ title, ...settings }, object) {
            object.commit(writer => { writer.set(AlarmState, { ...settings, enabled: true, nextAt: nextAlarmAt(settings, Date.now()) }); });
            return { title, data: {} };
          },
        }),
        project: (_data, object) => object.get(AlarmState),
        inspect: async (_data, object) => object.get(AlarmState),
        actions: [
          implementAction(ConfigureAlarm, { async execute(settings, object) {
            const next = configureAlarm(requireState(object.get(AlarmState)), settings, Date.now());
            object.commit(writer => { writer.set(AlarmState, next); });
            update(object.ref, next.nextAt);
          } }),
          implementAction(SetAlarmEnabled, { async execute({ enabled }, object) {
            const state = requireState(object.get(AlarmState));
            const next = { ...state, enabled, nextAt: enabled ? nextAlarmAt(state, Date.now()) : null };
            object.commit(writer => { writer.set(AlarmState, next); });
            update(object.ref, next.nextAt);
          } }),
        ],
      }),
    ],
  };
});
