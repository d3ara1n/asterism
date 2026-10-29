import { UsageQueryError, type PluginContext, type ProviderUsage, type UsageProviderServices } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "../lifecycle.ts";
import type { SdkScope } from "./scope.ts";

/** Usage implementations, explicit queries, and the shared cache retain their distinct responsibilities. */
export function bindUsage(providers: UsageProviderServices, usage: ProviderUsage, sessionRuns: RunGroup, scope: SdkScope):
  Pick<PluginContext, "usageProviders" | "usages" | "providerUsage"> {
  const { checkAvailable, subscribeRegistry } = scope;
  const outside = { affectsHistory: false } as const;
  const usageProviders: UsageProviderServices = {
    list: () => { checkAvailable(); return providers.list(); },
    get: id => {
      checkAvailable();
      const provider = providers.get(id);
      if (!provider) return null;
      if (provider.source === "headers") return { ...provider, parseHeaders(value) {
        checkAvailable(); return provider.parseHeaders(value);
      } };
      return { ...provider, query(value) {
        checkAvailable();
        const captured = { connection: structuredClone(value.connection), credential: value.credential };
        return sessionRuns.start(signal => provider.query({ ...captured, signal }), { ...outside, signal: value.signal }).done;
      } };
    },
    subscribe: listener => subscribeRegistry(providers, listener),
  };
  return {
    usageProviders,
    providerUsage: {
      query(id, options = {}) {
        checkAvailable();
        return sessionRuns.start(async signal => structuredClone(await usage.query(id, { ...options, signal })),
          { ...outside, signal: options.signal }).done;
      },
      consume(response) { checkAvailable(); usage.consume(structuredClone(response)); },
    },
    usages: {
      query(id, input) {
        const provider = usageProviders.get(id);
        if (!provider) throw new UsageQueryError("unavailable");
        if (provider.source === "headers") throw new UsageQueryError("unsupported");
        return provider.query(input);
      },
      parseHeaders(id, input) {
        const provider = usageProviders.get(id);
        if (!provider) throw new UsageQueryError("unavailable");
        if (provider.source !== "headers") throw new UsageQueryError("unsupported");
        return provider.parseHeaders(input);
      },
    },
  };
}
