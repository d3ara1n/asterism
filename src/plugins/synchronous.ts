import { PluginApiError } from "@asterism-app/sdk/runtime";

/** Synchronous interfaces also check actual return values, covering plugins that bypass TypeScript. */
export function synchronous<T>(work: () => T): T {
  const value = work();
  if (value && (typeof value === "object" || typeof value === "function") && "then" in value && typeof value.then === "function") {
    void Promise.resolve(value).catch(() => {});
    throw new PluginApiError("invalid_argument", "The callback must finish synchronously.");
  }
  return value;
}
