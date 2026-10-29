import type { ModelProviderServices } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../lifecycle.ts";
import type { SdkScope } from "./scope.ts";

/** Model connection reads and credential requests use the plugin's availability and cancellation scope. */
export function bindModelProviders(providers: ModelProviderServices, sessionRuns: RunGroup, scope: SdkScope): ModelProviderServices {
  const { checkAvailable, subscribeRegistry } = scope;
  const outside = { affectsHistory: false } as const;
  return {
    presets: () => { checkAvailable(); return providers.presets(); },
    list: () => { checkAvailable(); return structuredClone(providers.list()); },
    get: id => { checkAvailable(); return structuredClone(providers.get(id)); },
    credential: (id, options = {}) => {
      checkAvailable();
      return sessionRuns.start(signal => providers.credential(id, { signal }), { ...outside, signal: options.signal }).done;
    },
    subscribe: listener => subscribeRegistry(providers, listener),
  };
}
