import { z } from "zod";
import type { UiText, UsageItem } from "@atelier/sdk/contracts";
import { UsageQueryError, type UsageProvider, type UsageQueryContext } from "@atelier/sdk/runtime";

/** 金额接口可用十进制字符串，空串、布尔值和非有限数不能被当成零余额。 */
export const decimal = z.union([z.number(), z.string().trim().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u).transform(Number)])
  .pipe(z.number());
export const timestamp = z.string().refine(value => Number.isFinite(Date.parse(value)), "Invalid timestamp.")
  .transform(value => Date.parse(value)).pipe(z.number().nonnegative());

export function parseUsageResponse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new UsageQueryError("protocol");
  return result.data;
}
/** 查询路径由具体服务声明；复用错误分类、取消和认证，不跨站点回退。 */
export async function fetchUsageJson(context: UsageQueryContext, path: string, transport: typeof fetch = fetch,
  auth: "bearer" | "raw" = "bearer"): Promise<unknown> {
  const { connection, credential, signal } = context;
  if (!credential) throw new UsageQueryError("credential");
  const response = await transport(new URL(path, connection.endpoint), {
    headers: { Authorization: auth === "raw" ? credential : `Bearer ${credential}`, Accept: "application/json" },
    signal, redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new UsageQueryError(response.status === 401 || response.status === 403 ? "authentication"
      : response.status === 404 || response.status === 405 ? "unsupported"
      : response.status === 429 ? "rate_limit" : response.status >= 500 ? "server" : "protocol");
  }
  try { return await response.json(); } catch { throw new UsageQueryError("protocol"); }
}
export function jsonUsage(definition: {
  id: string; label: UiText; path: string; auth?: "bearer" | "raw"; parse(raw: unknown): UsageItem[];
}, transport: typeof fetch = fetch): UsageProvider {
  return { id: definition.id, label: definition.label, async query(context) {
    return definition.parse(await fetchUsageJson(context, definition.path, transport, definition.auth));
  } };
}
