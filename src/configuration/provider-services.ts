import type { ModelProviderServices, UsageProviderServices } from "@asterism-app/sdk/runtime";
import type { ConfigurationService } from "./service.ts";

/** Plugin-facing view of configured model providers; credentials are read at request time. */
export function createModelProviderServices(configuration: ConfigurationService): ModelProviderServices {
  const connection = (id: string) => {
    const provider = configuration.current().modelProviders.find(item => item.id === id);
    if (!provider) return null;
    const { credentialState: _state, ...value } = provider;
    return value;
  };
  return {
    presets: () => configuration.extensions.presets(),
    list: () => configuration.current().modelProviders.map(({ credentialState: _state, ...value }) => value),
    get: connection,
    credential: async (id, options) => {
      options?.signal?.throwIfAborted();
      const value = await configuration.executionCredential(id);
      options?.signal?.throwIfAborted();
      return connection(id)?.auth === "none" ? null : value;
    },
    subscribe: listener => configuration.subscribeProviders(listener),
  };
}
export function createUsageProviderServices(configuration: ConfigurationService): UsageProviderServices {
  return {
    list: () => configuration.extensions.usageProviders(),
    get: id => configuration.extensions.get(id),
    subscribe: listener => configuration.extensions.subscribe(listener),
  };
}
