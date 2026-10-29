import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { McpChanged, ReadUsage, UsageChanged } from "@asterism-app/sdk/contracts";
import { implementCall, type ManualSource, type ModelProviderServices, type UsageProviderServices } from "@asterism-app/sdk/runtime";
import type { ConfigurationService } from "../configuration/service.ts";
import { ProviderUsageService } from "../configuration/usage.ts";
import { McpApplication } from "../mcp/application.ts";
import { AgentCatalogService } from "../plugins/agent-catalog.ts";
import type { EventBus } from "../plugins/events.ts";
import type { SharedServices } from "../plugins/host.ts";
import { ShellHost } from "../shell/host.ts";
import { applicationStorage } from "../shared/application.ts";
import { ReadSkills, RefreshSkills, SkillsChanged } from "../shared/skills.ts";

export interface SharedServiceOptions {
  db: DatabaseSync;
  dataRoot: string;
  configuration: ConfigurationService;
  events: EventBus;
  manualSources(): readonly ManualSource[];
  packageRoots: ReadonlyMap<string, string>;
  /** User skill directories scanned alongside plugin contributions. */
  skillDirectories: readonly string[];
}

/** Plugin-facing view of configured model providers; credentials are read at request time. */
function modelProviders(configuration: ConfigurationService): ModelProviderServices {
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
function usageProviders(configuration: ConfigurationService): UsageProviderServices {
  return {
    list: () => configuration.extensions.usageProviders(),
    get: id => configuration.extensions.get(id),
    subscribe: listener => configuration.extensions.subscribe(listener),
  };
}

/** The single composition point for host services shared by all plugins; closing ends their connections, processes and caches. */
export function createSharedServices(options: SharedServiceOptions): SharedServices & { close(): Promise<void> } {
  const { configuration, events } = options;
  for (const contract of [McpChanged, SkillsChanged, UsageChanged]) events.declarePublic(contract);
  const mcp = new McpApplication(options.db, configuration, () => events.publish(McpChanged, null, {}));
  const shell = new ShellHost(() => configuration.shellSettings(), join(options.dataRoot, applicationStorage.shellIntegrationDirectory));
  const agentCatalog = new AgentCatalogService(options.skillDirectories);
  const stopCatalog = agentCatalog.subscribe(() => events.publish(SkillsChanged, null, agentCatalog.skills()));
  const models = modelProviders(configuration), usages = usageProviders(configuration);
  const usage = new ProviderUsageService(models, usages, providerId => events.publish(UsageChanged, null, { providerId }));
  return {
    mcp, shell, usage, agentCatalog, modelProviders: models, usageProviders: usages,
    webProviders: configuration.web, extensions: configuration.extensions,
    manualSources: options.manualSources, packageRoots: options.packageRoots,
    calls: [
      ...mcp.calls, ...shell.calls,
      implementCall(ReadSkills, async () => agentCatalog.skills()),
      implementCall(RefreshSkills, async (_input, { signal }) => agentCatalog.refresh(signal)),
      implementCall(ReadUsage, (input, { signal }) => usage.query(input.providerId, { refresh: input.refresh, signal })),
    ],
    async close() {
      stopCatalog();
      usage.close();
      await Promise.all([mcp.close(), shell.close()]);
    },
  };
}
