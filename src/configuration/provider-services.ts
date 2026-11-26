import type { LanguageModelProviderServices, UsageProviderServices } from "@asterism-app/sdk/runtime";
import type { ConfigurationService } from "./service.ts";

/** Plugin-facing view of configured model providers; credentials are read at request time. */
export function createLanguageModelProviderServices(configuration: ConfigurationService): LanguageModelProviderServices {
  const connection = (id: string) => {
    return configuration.languageModelProviders().find(item => item.id === id) ?? null;
  };
  return {
    presets: () => configuration.extensions.presets(),
    list: () => configuration.languageModelProviders(),
    get: connection,
    credential: async (id, options) => {
      options?.signal?.throwIfAborted();
      const value = await configuration.executionCredential(id, options?.signal);
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
