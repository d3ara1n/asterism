import { app } from "electron";
import { proxyRequestSchema } from "../shared/network.ts";

/** The main process resolves OS/PAC and application proxy rules for runtime requests. */
export async function handleProxyRequest(raw: unknown): Promise<unknown | null> {
  const parsed = proxyRequestSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { id, url } = parsed.data;
  try {
    return { kind: "proxy.response", id, ok: true, value: await app.resolveProxy(url) };
  } catch (error) {
    return { kind: "proxy.response", id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
