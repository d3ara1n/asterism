import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { McpChanged, ReadUsage, UsageChanged, SystemResumed, ReadResourceActivities, ResourceActivitiesChanged, ResourceNoticeRaised } from "@asterism-app/sdk/contracts";
import { implementCall, PluginApiError, type ManualSource } from "@asterism-app/sdk/runtime";
import type { ConfigurationService } from "../configuration/service.ts";
import { ProviderUsageService } from "../configuration/usage.ts";
import { createModelProviderServices, createUsageProviderServices } from "../configuration/provider-services.ts";
import { McpApplication } from "../mcp/application.ts";
import { AgentCatalogService, skillDocumentBody } from "../plugins/agent-catalog.ts";
import type { EventBus } from "../plugins/events.ts";
import type { SharedServices } from "../plugins/host.ts";
import { DeadlineScheduler } from "./deadline-scheduler.ts";
import { ResourceActivities } from "./resource-activities.ts";
import { ShellHost } from "../shell/host.ts";
import { applicationStorage } from "../shared/application.ts";
import { ReadSkillDocument, ReadSkills, RefreshSkills, SkillsChanged } from "../shared/skills.ts";

export interface SharedServiceOptions {
  db: DatabaseSync;
  dataRoot: string;
  configuration: ConfigurationService;
  events: EventBus;
  manualSources(): readonly ManualSource[];
  packageRoots: ReadonlyMap<string, string>;
  /** User skill directories scanned alongside plugin contributions. */
  skillDirectories: readonly string[];
  telemetry?: import("../telemetry/service.ts").TelemetryService;
}

/** The single composition point for host services shared by all plugins; closing ends their connections, processes and caches. */
export function createSharedServices(options: SharedServiceOptions): SharedServices & { close(): Promise<void> } {
  const { configuration, events } = options;
  for (const contract of [McpChanged, SkillsChanged, UsageChanged, ResourceActivitiesChanged, ResourceNoticeRaised]) events.declarePublic(contract);
  const activities = new ResourceActivities(() => events.publish(ResourceActivitiesChanged, null, {}));
  const deadlines = new DeadlineScheduler(error => console.error("Deadline callback failed.", error));
  const resume = events.listen(SystemResumed, {}, () => deadlines.recheck());
  const mcp = new McpApplication(options.db, configuration, () => events.publish(McpChanged, null, {}));
  const shell = new ShellHost(() => configuration.shellSettings(), join(options.dataRoot, applicationStorage.shellIntegrationDirectory));
  const agentCatalog = new AgentCatalogService(options.skillDirectories);
  const stopCatalog = agentCatalog.subscribe(() => events.publish(SkillsChanged, null, agentCatalog.skills()));
  const models = createModelProviderServices(configuration), usages = createUsageProviderServices(configuration);
  const usage = new ProviderUsageService(models, usages, providerId => events.publish(UsageChanged, null, { providerId }));
  return {
    activities, mcp, shell, deadlines, usage, agentCatalog, modelProviders: models, usageProviders: usages,
    webProviders: configuration.web, messaging: configuration.messaging, extensions: configuration.extensions,
    telemetry: options.telemetry,
    manualSources: options.manualSources, packageRoots: options.packageRoots,
    calls: [
      ...mcp.calls, ...shell.calls,
      implementCall(ReadResourceActivities, async () => activities.read()),
      implementCall(ReadSkills, async () => agentCatalog.skills()),
      implementCall(RefreshSkills, async (_input, { signal }) => agentCatalog.refresh(signal)),
      implementCall(ReadSkillDocument, async ({ source, name }, { signal }) => {
        const skill = agentCatalog.skills().find(item => item.id === source)?.skills.find(item => item.name === name);
        if (!skill) throw new PluginApiError("rejected", `Skill "${name}" is absent from source "${source}".`, "skill_not_found");
        return { text: skillDocumentBody(await agentCatalog.read(skill, "SKILL.md", signal)) };
      }),
      implementCall(ReadUsage, (input, { signal }) => usage.query(input.providerId, { refresh: input.refresh, signal })),
    ],
    async close() {
      resume.close();
      deadlines.close();
      stopCatalog();
      usage.close();
      const results = await Promise.allSettled([mcp.close(), shell.close()]);
      const errors = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
      if (errors.length === 1) throw errors[0];
      if (errors.length) throw new AggregateError(errors, "Shared service cleanup failed.");
    },
  };
}
