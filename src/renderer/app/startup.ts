import type { RendererModule, RendererPlugin } from "@atelier/sdk/renderer";
import type { EventSubscriber, PluginCalls } from "@atelier/sdk/contracts";

const unavailableCalls: PluginCalls = { invoke: async () => { throw new Error("Renderer calls are unavailable."); } };
function scopedCalls(calls: PluginCalls, signal: AbortSignal): PluginCalls {
  return { invoke: (contract, input, options) => calls.invoke(contract, input,
    { ...options, signal: options?.signal ? AbortSignal.any([signal, options.signal]) : signal }) };
}

/** 单个模块准备的等待上限；超时只放弃等待并通知模块停止，不阻止启动。 */
export const MODULE_PREPARE_TIMEOUT_MS = 10_000;

/** 插件共享服务准备完成后再准备功能模块；关闭按依赖逆序由调用方执行。 */
export async function preparePlugin(plugin: RendererPlugin, events: EventSubscriber, signal: AbortSignal,
  timeout = MODULE_PREPARE_TIMEOUT_MS, registerCleanup?: (close: () => Promise<void>) => void,
  calls: PluginCalls = unavailableCalls): Promise<() => Promise<void>> {
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
    // closed 信封只表示订阅停止接收，不能替代处理器和超时准备的真实结束。
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
    await prepareModules(plugin.modules ?? [], scoped, timeout, lifetime, track, calls);
    return close;
  } catch (error) {
    // 超时不假装工作已结束；取消后等待实际准备退出再释放共享服务。
    void close().catch(failure => console.error("Renderer plugin cleanup failed.", failure));
    throw error;
  } finally { clearTimeout(timer); }
}

/** 并行运行模块准备；失败与超时记录日志后继续，视图保留。 */
export async function prepareModules(modules: readonly RendererModule[], events: EventSubscriber, timeout = MODULE_PREPARE_TIMEOUT_MS,
  signal?: AbortSignal, track: (work: Promise<void>) => Promise<void> = work => work,
  calls: PluginCalls = unavailableCalls): Promise<void> {
  await Promise.all(modules.map(async (module, index) => {
    if (!module.prepare) return;
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
      }
    } catch (error) {
      controller.abort();
      console.error(`Renderer module ${index} preparation failed.`, error);
    } finally {
      clearTimeout(timer);
    }
  }));
}

/** 静态启动屏的阶段文案；语言就绪前只显示指示器。 */
export function showStartupStage(text: string): void {
  const label = document.getElementById("startup-stage");
  if (label) label.textContent = text;
}
