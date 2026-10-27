/** Load styles before view preparation; remove them on failure, cancellation, or frontend lifecycle completion. */
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
