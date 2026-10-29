import { applicationBrand, applicationUserAgent } from "../shared/application.ts";
import type { SessionDirectory, PluginCalls } from "@asterism-app/sdk/contracts";
import { PluginApiError, type PluginContext, type ResourceRef } from "@asterism-app/sdk/runtime";
import type { RunGroup } from "./lifecycle.ts";
import type { PluginHostServices } from "./loader.ts";
import type { PluginEventScope } from "./event-scope.ts";
import type { BoundTopLevelTool } from "./top-level-tools.ts";
import { packageAsset } from "./package-assets.ts";
import { createSdkScope } from "./sdk/scope.ts";
import { bindObjects } from "./sdk/objects.ts";
import { bindModels } from "./sdk/models.ts";
import { bindExecution } from "./sdk/execution.ts";
import { bindMcp } from "./sdk/mcp.ts";
import { bindWeb } from "./sdk/web.ts";
import { bindModelProviders } from "./sdk/model-providers.ts";
import { bindUsage } from "./sdk/usage.ts";
import { bindAgentCatalog } from "./sdk/agent-catalog.ts";
import { bindShellServices } from "./sdk/shell.ts";

type PluginServices = Pick<PluginContext, "id" | "dir" | "log" | "config" | "secrets" | "db" | "tasks" | "lifetime">;
/** Assemble plugin-facing capabilities; each domain adapter owns its data and execution boundaries. */
export function createSdkContext(internal: PluginServices, host: PluginHostServices, modelRuns: RunGroup, sessionRuns: RunGroup, directory: SessionDirectory, eventScope: PluginEventScope,
  calls: PluginCalls, topLevelTools: (ref: ResourceRef, policy: (name: string) => boolean, linked: readonly ResourceRef[], interactive: boolean) => BoundTopLevelTool[]) {
  const scope = createSdkScope(internal.lifetime), { checkAvailable } = scope;
  const objects = bindObjects(internal.id, host, sessionRuns, eventScope, checkAvailable);
  const models = bindModels(internal.id, host, modelRuns, checkAvailable);
  const execution = bindExecution({ owner: internal.id, host, runs: modelRuns, objects, checkAvailable, topLevelTools });
  const shared = host.shared;
  const context: PluginContext = {
    mcp: bindMcp(shared.mcp, sessionRuns, scope),
    shell: bindShellServices(shared.shell, sessionRuns, checkAvailable),
    ...bindWeb(shared.webProviders, sessionRuns, scope),
    modelProviders: bindModelProviders(shared.modelProviders, sessionRuns, scope),
    ...bindUsage(shared.usageProviders, shared.usage, sessionRuns, scope),
    agentCatalog: bindAgentCatalog(shared.agentCatalog, sessionRuns, checkAvailable),
    models,
    execution: execution.execution,
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
    id: internal.id, lifetime: internal.lifetime, sessions: directory, dir: internal.dir, log: internal.log,
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
