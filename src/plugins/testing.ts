import { ModelProviderExtensions } from "../configuration/provider-extensions.ts";
import { WebProviderRegistry } from "../configuration/web-providers.ts";
import { AgentCatalogService } from "./agent-catalog.ts";
import type { SharedServices } from "./host.ts";
import type { PluginHostServices } from "./loader.ts";
import { ResourceHolds } from "../runtime/resource-holds.ts";

/** Loader fixture: real registries for contribution bookkeeping; services a test does not supply are absent. */
export function testHostServices(overrides: Partial<Omit<PluginHostServices, "shared">> & { shared?: Partial<SharedServices> } = {}): PluginHostServices {
  const { shared, ...host } = overrides;
  return {
    holds: new ResourceHolds(), extensionsDirectory: "/unused", data: null as never, refOf: () => null, sessions: { progressChanged() {}, retirementChanged() {} } as never,
    models: { list: () => [] } as never, log: () => {},
    ...host,
    shared: {
      agentCatalog: new AgentCatalogService([]), extensions: new ModelProviderExtensions(),
      webProviders: new WebProviderRegistry({ list: () => [], credential: async () => null }),
      manualSources: () => [], packageRoots: new Map(), calls: [],
      ...shared,
    } as SharedServices,
  };
}
