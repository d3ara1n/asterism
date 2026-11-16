/** Wait on explicit asynchronous Markdown work, not an arbitrary screenshot delay. */
async function ready(node: HTMLElement, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: unknown) => {
      observer.disconnect();
      signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve();
    };
    const check = () => { if (!node.querySelector("[data-render-pending]")) finish(); };
    const abort = () => finish(signal.reason);
    const observer = new MutationObserver(check);
    observer.observe(node, { attributes: true, childList: true, subtree: true });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort(); else check();
  });
  await document.fonts.ready;
  await Promise.all([...node.querySelectorAll("img")].map(image => image.decode().catch(() => {
    // Markdown renders its own failed-image label; wait for that change before capturing.
    if (image.isConnected) throw new Error(`Image could not be decoded: ${image.currentSrc}`);
  })));
  signal.throwIfAborted();
}

export class ShareImageSizeError extends Error {}

export async function shareImage(node: HTMLElement, signal: AbortSignal): Promise<Blob> {
  await ready(node, signal);
  const { domToBlob } = await import("modern-screenshot");
  signal.throwIfAborted();
  const width = Math.ceil(node.getBoundingClientRect().width), height = Math.ceil(node.getBoundingClientRect().height);
  // Chromium canvas has finite dimensions. Keep one complete image; never silently crop or paginate it.
  if (width > 32767 || height > 32767) throw new ShareImageSizeError("The excerpt exceeds Chromium's canvas dimensions.");
  let embeddingFailed = false;
  const blob = await domToBlob(node, { scale: 1, width, height, type: "image/png", maximumCanvasSize: 32767,
    // The library logs and absorbs failed embedding tasks. Preserve their failure for our caller.
    fetch: { requestInit: { signal }, placeholderImage: () => { embeddingFailed = true; return ""; } } });
  signal.throwIfAborted();
  if (embeddingFailed) throw new Error("An image asset could not be embedded.");
  if (!blob) throw new Error("Image encoding returned no data.");
  return blob;
}
