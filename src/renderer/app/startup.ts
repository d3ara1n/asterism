import type { RendererModule } from "@atelier/sdk/renderer";

/** 单个模块准备的等待上限；超时只放弃等待并通知模块停止，不阻止启动。 */
export const MODULE_PREPARE_TIMEOUT_MS = 10_000;

/** 并行运行模块准备；失败与超时记录日志后继续，视图保留。 */
export async function prepareModules(modules: readonly RendererModule[], timeout = MODULE_PREPARE_TIMEOUT_MS): Promise<void> {
  await Promise.all(modules.map(async (module, index) => {
    if (!module.prepare) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<"timeout">(resolve => { timer = setTimeout(() => resolve("timeout"), timeout); });
    try {
      const outcome = await Promise.race([Promise.resolve().then(() => module.prepare!({ signal: controller.signal })), expired]);
      if (outcome === "timeout") {
        controller.abort();
        console.error(`Renderer module ${index} preparation timed out.`);
      }
    } catch (error) {
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
