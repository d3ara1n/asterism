import { PluginApiError } from "@asterism/sdk/runtime";

/** 同步接口也检查实际返回值，覆盖不经过 TypeScript 的插件。 */
export function synchronous<T>(work: () => T): T {
  const value = work();
  if (value && (typeof value === "object" || typeof value === "function") && "then" in value && typeof value.then === "function") {
    void Promise.resolve(value).catch(() => {});
    throw new PluginApiError("invalid_argument", "The callback must finish synchronously.");
  }
  return value;
}
