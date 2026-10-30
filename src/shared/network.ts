import { z } from "zod";
import { coreChannel } from "./core.ts";

export const networkGetChannel = coreChannel("network-get");
export const networkSetChannel = coreChannel("network-set");
export const networkChangedChannel = coreChannel("network-changed");

/** A proxy endpoint has no resource path or embedded credentials. */
export function proxyAddress(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:", "socks5:"].includes(url.protocol) || !url.hostname ||
      url.username || url.password || (url.pathname && url.pathname !== "/") || url.search || url.hash) return null;
    return `${url.protocol}//${url.host}`;
  } catch { return null; }
}

export const networkPreferenceSchema = z.strictObject({
  mode: z.enum(["system", "direct", "custom"]),
  server: z.string().trim(),
  bypass: z.string().trim(),
}).refine(value => value.server === "" ? value.mode !== "custom" : proxyAddress(value.server) !== null, {
  path: ["server"], message: "Enter an HTTP, HTTPS, or SOCKS5 proxy address without credentials or a path.",
}).transform(value => ({ ...value, server: proxyAddress(value.server) ?? value.server }));
export type NetworkPreference = z.infer<typeof networkPreferenceSchema>;
export const defaultNetworkPreference: NetworkPreference = { mode: "system", server: "", bypass: "" };
export const networkStateSchema = z.strictObject({
  preference: networkPreferenceSchema,
  restartRequired: z.boolean(),
});
export type NetworkState = z.infer<typeof networkStateSchema>;
export interface NetworkBridge {
  get(): Promise<NetworkState>;
  set(preference: NetworkPreference): Promise<NetworkState>;
  onChanged(listener: (state: NetworkState) => void): () => void;
}

export const proxyRequestSchema = z.strictObject({
  kind: z.literal("proxy.request"), id: z.string(),
  url: z.url({ protocol: /^https?$/ }),
});
export const proxyResponseSchema = z.discriminatedUnion("ok", [
  z.strictObject({ kind: z.literal("proxy.response"), id: z.string(), ok: z.literal(true), value: z.string() }),
  z.strictObject({ kind: z.literal("proxy.response"), id: z.string(), ok: z.literal(false), error: z.string() }),
]);

/** Chromium returns proxies in preference order. Connection failures remain visible to the caller. */
export function resolvedProxyAddress(result: string): string | null {
  const first = result.split(";")[0]?.trim() ?? "";
  if (first === "DIRECT") return null;
  const match = /^(PROXY|HTTPS|SOCKS5)\s+(\S+)$/u.exec(first);
  if (!match) throw new Error(`Unsupported system proxy result: ${first}`);
  const protocol = match[1] === "PROXY" ? "http" : match[1] === "HTTPS" ? "https" : "socks5";
  const address = proxyAddress(`${protocol}://${match[2]}`);
  if (!address) throw new Error("The system returned an invalid proxy address.");
  return address;
}
