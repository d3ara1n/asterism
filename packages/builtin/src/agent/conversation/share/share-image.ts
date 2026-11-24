/** Chromium canvas dimension limit; one complete image is produced or the export fails, never a cropped or paginated one. */
const canvasLimit = 32767;

/** Output scale for an excerpt of layout size width × height: 2x for sharp text, reduced for long excerpts down to 1x; null when even 1x exceeds the limit. */
export function shareImageScale(width: number, height: number): number | null {
  const scale = Math.min(2, canvasLimit / width, canvasLimit / height);
  return scale >= 1 ? scale : null;
}

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
  // Layout size, not the bounding box: the preview may display the document scaled down.
  const width = node.offsetWidth, height = node.offsetHeight;
  const scale = shareImageScale(width, height);
  if (scale === null) throw new ShareImageSizeError("The excerpt exceeds Chromium's canvas dimensions.");
  let embeddingFailed = false;
  const blob = await domToBlob(node, { scale, width, height, type: "image/png",
    // The library logs and absorbs failed embedding tasks. Preserve their failure for our caller.
    fetch: { requestInit: { signal }, placeholderImage: () => { embeddingFailed = true; return ""; } } });
  signal.throwIfAborted();
  if (embeddingFailed) throw new Error("An image asset could not be embedded.");
  if (!blob) throw new Error("Image encoding returned no data.");
  return blob;
}
