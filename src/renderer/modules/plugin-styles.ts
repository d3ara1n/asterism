/** 样式在视图准备前加载；失败、取消或前端生命周期结束时移除。 */
export function loadPluginStylesheet(path: string, signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    const dispose = () => {
      link.onload = null; link.onerror = null;
      signal.removeEventListener("abort", abort);
      link.remove();
    };
    const abort = () => { dispose(); reject(signal.reason); };
    link.rel = "stylesheet";
    link.href = `asterism-plugin://${path}`;
    link.onload = () => {
      link.onload = null; link.onerror = null;
      resolve(dispose);
    };
    link.onerror = () => {
      dispose();
      reject(new Error(`Plugin stylesheet could not be loaded: ${path}`));
    };
    signal.addEventListener("abort", abort, { once: true });
    document.head.append(link);
  });
}
