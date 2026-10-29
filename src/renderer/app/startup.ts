import type { RendererModule, RendererPlugin, RendererCalls } from "@asterism-app/sdk/renderer";
import type { EventSubscriber } from "@asterism-app/sdk/contracts";
import type { RendererDiagnostic } from "../modules/plugin-outcome";
import { pluginErrorMessage } from "../../shared/plugin-startup";

const unavailableCalls: RendererCalls = { input: () => { throw new Error("Renderer content inputs are unavailable."); }, invoke: async () => { throw new Error("Renderer calls are unavailable."); } };
function scopedCalls(calls: RendererCalls, signal: AbortSignal): RendererCalls {
  return { input: contract => calls.input(contract), invoke: (contract, input, options) => calls.invoke(contract, input,
    { ...options, signal: options?.signal ? AbortSignal.any([signal, options.signal]) : signal }) };
}

/** Maximum wait for one module's preparation; timeout only stops waiting and tells the module to stop, without blocking startup. */
export const MODULE_PREPARE_TIMEOUT_MS = 10_000;

/** Prepare feature modules after shared plugin services are ready; the caller shuts down in reverse dependency order. */
export async function preparePlugin(plugin: RendererPlugin, events: EventSubscriber, signal: AbortSignal,
  timeout = MODULE_PREPARE_TIMEOUT_MS, registerCleanup?: (close: () => Promise<void>) => void,
  calls: RendererCalls = unavailableCalls): Promise<{ close(): Promise<void>; diagnostics: RendererDiagnostic[] }> {
  const controller = new AbortController();
  const lifetime = AbortSignal.any([signal, controller.signal]);
  const work = new Set<Promise<void>>();
  const track = (pending: Promise<void>) => {
    work.add(pending);
    void pending.then(() => work.delete(pending), () => work.delete(pending));
    return pending;
  };
  const scoped: EventSubscriber = { subscribe: (contract, options, handler) => events.subscribe(contract,
    { ...options, signal: options.signal ? AbortSignal.any([lifetime, options.signal]) : lifetime },
    (event, context) => track(Promise.resolve().then(() => {
      lifetime.throwIfAborted();
      return handler(event, context);
    }))) };
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    controller.abort();
    // A closed envelope only means the subscription has stopped receiving; it does not mean handlers or timed-out preparation have actually finished.
    while (work.size) await Promise.allSettled([...work]);
    await plugin.closing?.();
  })();
  registerCleanup?.(close);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    signal.throwIfAborted();
    const preparation = track(Promise.resolve().then(() => plugin.prepare?.({ events: scoped, signal: lifetime, calls: scopedCalls(calls, lifetime) })));
    await Promise.race([preparation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Renderer plugin preparation timed out.")), timeout);
    })]);
    signal.throwIfAborted();
    const diagnostics = await prepareModules(plugin.modules ?? [], scoped, timeout, lifetime, track, calls);
    signal.throwIfAborted();
    return { close, diagnostics };
  } catch (error) {
    // Timeout does not imply the work has finished; after cancellation, wait for preparation to actually exit before releasing shared services.
    void close().catch(failure => console.error("Renderer plugin cleanup failed.", failure));
    throw error;
  } finally { clearTimeout(timer); }
}

/** Run module preparation in parallel, retaining views and reporting partial initialization. */
export async function prepareModules(modules: readonly RendererModule[], events: EventSubscriber, timeout = MODULE_PREPARE_TIMEOUT_MS,
  signal?: AbortSignal, track: (work: Promise<void>) => Promise<void> = work => work,
  calls: RendererCalls = unavailableCalls): Promise<RendererDiagnostic[]> {
  const outcomes = await Promise.all(modules.map(async (module, index): Promise<RendererDiagnostic | undefined> => {
    if (!module.prepare) return undefined;
    const controller = new AbortController();
    const lifetime = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const scoped: EventSubscriber = { subscribe: (contract, options, handler) => events.subscribe(contract,
      { ...options, signal: options.signal ? AbortSignal.any([lifetime, options.signal]) : lifetime }, handler) };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<"timeout">(resolve => { timer = setTimeout(() => resolve("timeout"), timeout); });
    try {
      const outcome = await Promise.race([track(Promise.resolve().then(() => module.prepare!({ signal: lifetime, events: scoped, calls: scopedCalls(calls, lifetime) }))), expired]);
      if (outcome === "timeout") {
        controller.abort();
        console.error(`Renderer module ${index} preparation timed out.`);
        return { stage: "module", module: index, message: "Module preparation timed out." };
      }
    } catch (error) {
      controller.abort();
      console.error(`Renderer module ${index} preparation failed.`, error);
      return { stage: "module", module: index, message: pluginErrorMessage(error) };
    } finally {
      clearTimeout(timer);
    }
  }));
  return outcomes.filter((item): item is RendererDiagnostic => item !== undefined);
}
