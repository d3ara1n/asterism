import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { net } from "electron";
import { pathWithin } from "../storage/paths.ts";
import { rendererDocument } from "../shared/renderer-document.ts";

/** The packaged shell uses one known root; each document gets its own import-map CSP nonce. */
export async function serveRendererDocument(request: Request, root: string): Promise<Response> {
  const url = new URL(request.url);
  const file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!pathWithin(root, file)) return new Response(null, { status: 404 });
  if (file === resolve(root, "index.html")) {
    const html = rendererDocument(await readFile(file, "utf8"), randomBytes(24).toString("base64"));
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return net.fetch(pathToFileURL(file).href);
}
