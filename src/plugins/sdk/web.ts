import type { PluginContext, WebProviderInstance } from "@asterism-app/sdk/runtime";
import type { WebProviderRegistry } from "../../configuration/web-providers.ts";
import type { RunGroup } from "../lifecycle.ts";
import type { SdkScope } from "./scope.ts";

/** Bind provider resolution and web operations to plugin availability and cancellation. */
export function bindWeb(webProviders: WebProviderRegistry, sessionRuns: RunGroup, scope: SdkScope): Pick<PluginContext, "webProviders" | "web"> {
  const { checkAvailable, subscribeRegistry } = scope;
  const outside = { affectsHistory: false } as const;
  return {
    webProviders: {
      types: () => { checkAvailable(); return webProviders.types(); },
      list: () => { checkAvailable(); return webProviders.list(); },
      get: id => { checkAvailable(); return webProviders.get(id); },
      subscribe: listener => subscribeRegistry(webProviders, listener),
      async resolve(id, options) {
        checkAvailable();
        const instance = await webProviders.resolve(id, options);
        const bound: WebProviderInstance = {};
        if (instance.search) bound.search = (request, opts) => {
          checkAvailable();
          const input = structuredClone(request);
          return sessionRuns.start(scope => instance.search!(input, { signal: scope }), { ...outside, signal: opts.signal }).done;
        };
        if (instance.fetch) bound.fetch = (request, opts) => {
          checkAvailable();
          const input = structuredClone(request);
          return sessionRuns.start(scope => instance.fetch!(input, { signal: scope }), { ...outside, signal: opts.signal }).done;
        };
        return bound;
      },
    },
    web: {
      search(request, options) {
        checkAvailable();
        const input = structuredClone(request);
        return sessionRuns.start(scope => webProviders.search(input, { signal: scope }), { ...outside, signal: options.signal }).done;
      },
      fetch(request, options) {
        checkAvailable();
        const input = structuredClone(request);
        return sessionRuns.start(signal => webProviders.fetch(input, { signal }), { ...outside, signal: options.signal }).done;
      },
    },
  };
}
