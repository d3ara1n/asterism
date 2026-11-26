import { applicationBrand, applicationUserAgent } from "../shared/application.ts";
import type { SessionDirectory, PluginCalls } from "@asterism-app/sdk/contracts";
import { PluginApiError, type PluginContext, type ResourceRef, type ToolCaller } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "./lifecycle.ts";
import type { PluginHostServices } from "./loader.ts";
import type { PluginEventScope } from "./event-scope.ts";
import type { BoundTopLevelTool } from "./top-level-tools.ts";
import { packageAsset } from "./package-assets.ts";
import { createSdkScope } from "./sdk/scope.ts";
import { bindObjects } from "./sdk/objects.ts";
import { bindLanguageModels } from "./sdk/models.ts";
import { bindExecution } from "./sdk/execution.ts";
import { bindMcp } from "./sdk/mcp.ts";
import { bindMessaging } from "./sdk/messaging.ts";
import { bindWeb } from "./sdk/web.ts";
import { bindLanguageModelProviders } from "./sdk/model-providers.ts";
import { bindUsage } from "./sdk/usage.ts";
import { bindAgentCatalog } from "./sdk/agent-catalog.ts";
import { bindShellServices } from "./sdk/shell.ts";
import { bindFiles } from "./sdk/files.ts";
import type { ResourceRegistry } from "../resources/registry.ts";

type PluginServices = Pick<PluginContext, "id" | "dir" | "cacheDir" | "tempDir" | "log" | "config" | "secrets" | "db" | "tasks" | "lifetime">;
/** Assemble plugin-facing capabilities; each domain adapter owns its data and execution boundaries. */
export function createSdkContext(internal: PluginServices, host: PluginHostServices, modelRuns: RunGroup, sessionRuns: RunGroup, directory: SessionDirectory, eventScope: PluginEventScope,
  calls: PluginCalls, topLevelTools: (caller: ToolCaller, policy: (name: string) => boolean, linked: readonly ResourceRef[], interactive: boolean, resourceToolRestriction: (kind: string) => string | null) => BoundTopLevelTool[],
  resources: () => ResourceRegistry) {
  const scope = createSdkScope(internal.lifetime), { checkAvailable } = scope;
  const objects = bindObjects(internal.id, host, sessionRuns, eventScope, checkAvailable);
  const languageModels = bindLanguageModels(internal.id, host, modelRuns, checkAvailable);
  const execution = bindExecution({ owner: internal.id, host, events: eventScope, runs: modelRuns, objects, checkAvailable, topLevelTools });
  const shared = host.shared;
  const context: PluginContext = {
    deadlines: {
      schedule(at, callback, options) {
        checkAvailable();
        const signal = options?.signal ? AbortSignal.any([internal.lifetime.signal, options.signal]) : internal.lifetime.signal;
        return shared.deadlines.schedule(at, async () => {
          try { checkAvailable(); await callback(); }
          catch (error) { internal.log.error("Deadline callback failed.", error); }
        }, { signal });
      },
    },
    mcp: bindMcp(shared.mcp, sessionRuns, scope),
    shell: bindShellServices(shared.shell, sessionRuns, checkAvailable),
    ...bindWeb(shared.webProviders, sessionRuns, scope),
    messaging: bindMessaging(shared.messaging, sessionRuns, internal.lifetime, scope),
    languageModelProviders: bindLanguageModelProviders(shared.languageModelProviders, sessionRuns, scope),
    ...bindUsage(shared.usageProviders, shared.usage, sessionRuns, scope),
    telemetry: {
      recordExternalUsage(record) {
        checkAvailable();
        shared.usageLedger.recordExternalUsage({
          recordedAt: record.recordedAt ?? Date.now(),
          pluginId: internal.id,
          sessionId: record.sessionId ?? null,
          category: record.category,
          providerLabel: record.provider ?? null,
          quantity: record.quantity ?? null,
          unit: record.unit ?? null,
          currency: record.currency ?? null,
          amount: record.amount ?? null,
          outcome: record.outcome ?? "succeeded",
          durationMs: record.durationMs ?? null,
        });
      },
    },
    agentCatalog: bindAgentCatalog(shared.agentCatalog, sessionRuns, checkAvailable),
    languageModels,
    execution: execution.execution,
    files: bindFiles(host, resources, sessionRuns, internal.lifetime.signal, checkAvailable),
    content: {
      async withScope(work) {
        checkAvailable();
        const store = host.content;
        if (!store) throw new PluginApiError("unavailable", "Content storage is unavailable.");
        const scope = store.scope();
        const content = store.writer({ owner: internal.id, scope, check: checkAvailable });
        try { return await work({ ...content, retain: (value, source) => store.retain(scope, value, source, internal.id) }); }
        finally { await scope.close(); }
      },
    },
    application: Object.freeze({ name: applicationBrand.en, userAgent: applicationUserAgent }),
    manual: { sources() { checkAvailable(); return structuredClone(shared.manualSources()); } },
    ipc: { events: eventScope.api, calls },
    id: internal.id, lifetime: internal.lifetime, sessions: directory, dir: internal.dir, cacheDir: internal.cacheDir, tempDir: internal.tempDir, log: internal.log,
    createSession: objects.createSession,
    assets: { path(relativePath) {
      checkAvailable();
      const root = shared.packageRoots.get(internal.id);
      if (!root) throw new PluginApiError("unavailable", "The plugin was not loaded from a package.");
      return packageAsset(root, relativePath);
    } },
    config: contract => {
      checkAvailable();
      if (contract.plugin !== internal.id) throw new PluginApiError("foreign_resource", "The configuration belongs to another plugin.");
      return internal.config(contract);
    },
    secrets: internal.secrets, db: () => { checkAvailable(); return internal.db(); },
    tasks: {
      start(key, run, options) {
        checkAvailable();
        if (options?.object) {
          objects.own(options.object.kind); objects.checkRef(options.object);
          if (!objects.reader(options.object).snapshot())
            throw new PluginApiError("unavailable", "The task owner is not on the current session path.");
        }
        return internal.tasks.start(key, run, options);
      },
      cancel: key => internal.tasks.cancel(key),
      has: key => internal.tasks.has(key),
    },
    session: objects.session,
    object: (sessionId, contract, id) => { objects.own(contract.kind); return objects.object({ sessionId, id, kind: contract.kind }); },
  };
  return {
    context, object: objects.object, reader: objects.reader, content: objects.content, linkAbort: objects.linkAbort,
    toolSession: objects.toolSession, declare: objects.declare, activity: execution.activity,
    disable: () => { scope.disable(); modelRuns.stop(); },
  };
}
export type SdkContext = ReturnType<typeof createSdkContext>;
