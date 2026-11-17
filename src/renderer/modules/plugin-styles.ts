interface Stylesheet {
  link: HTMLLinkElement;
  ready: Promise<void>;
  references: number;
}
const stylesheets = new Map<string, Stylesheet>();
/** One link per URL; each plugin owns a reference until failure, cancellation, or frontend lifetime completion. */
export function loadPluginStylesheet(path: string, signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  let stylesheet = stylesheets.get(path);
  if (!stylesheet) {
    const link = document.createElement("link");
    const ready = new Promise<void>((resolve, reject) => {
      link.onload = () => { link.onload = null; link.onerror = null; resolve(); };
      link.onerror = () => { link.onload = null; link.onerror = null; reject(new Error(`Plugin stylesheet could not be loaded: ${path}`)); };
    });
    stylesheet = { link, ready, references: 0 };
    stylesheets.set(path, stylesheet);
    link.rel = "stylesheet";
    link.href = `asterism-plugin://${path}`;
    document.head.append(link);
  }
  const record = stylesheet;
  record.references++;
  return new Promise((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener("abort", abort);
      if (--record.references === 0) { record.link.remove(); stylesheets.delete(path); }
    };
    const abort = () => { release(); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    record.ready.then(() => { if (!released) resolve(release); }, error => { release(); reject(error); });
  });
}
