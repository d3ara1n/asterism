import { PluginApiError, type Lifetime } from "@asterism-app/sdk/runtime";
import { synchronous } from "../synchronous.ts";

/** Availability and subscriptions shared by the capabilities of one plugin. */
export function createSdkScope(lifetime: Lifetime) {
  let available = true;
  const checkAvailable = () => {
    if (!available) throw new PluginApiError("unavailable", "The plugin is not available.");
  };
  return {
    checkAvailable,
    subscribeRegistry(registry: { subscribe(listener: () => void): () => void }, listener: () => void) {
      checkAvailable();
      const unsubscribe = registry.subscribe(() => { checkAvailable(); synchronous(listener); });
      const release = () => { unsubscribe(); lifetime.signal.removeEventListener("abort", release); };
      lifetime.signal.addEventListener("abort", release, { once: true });
      return release;
    },
    disable: () => { available = false; },
  };
}
export type SdkScope = ReturnType<typeof createSdkScope>;
