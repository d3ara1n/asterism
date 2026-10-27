import { z } from "zod";
import { definePlugin, implementCall, PluginApiError } from "@asterism/sdk/runtime";
import { builtin, CreateAgent, agentCreateSchema, type NamingApi } from "@asterism/builtin-api/contracts";
import { defineAgentCreation, type ManualSource } from "@asterism/builtin-api/runtime";
import metadata from "../package.json" with { type: "json" };
import type { BuiltinApplication } from "./application.ts";
import { createAgentModule } from "./agent/runtime.ts";
import { createFilesystemModule } from "./filesystem/runtime.ts";
import { createManualModule } from "./manual/runtime.ts";
import { CreateManual } from "./manual/contract.ts";
import notes from "./notes/runtime.ts";
import { BuiltinSettings } from "./settings/contract.ts";
import { createNamingModule } from "./naming/runtime.ts";
import questions from "./questions/runtime.ts";
import resourceOperations from "./resources/runtime.ts";
import { CreateNote } from "./notes/contract.ts";
import providers from "./providers/runtime.ts";
import { UsageConsumer } from "./usage/service.ts";
import { ReadUsage, UsageChanged } from "./usage/contract.ts";
import { ShellService } from "./shell/service.ts";
import { createShellModule } from "./shell/runtime.ts";
import { createTerminalModule } from "./terminal/runtime.ts";
import { CreateTerminal } from "./terminal/contract.ts";
import mcp from "./mcp/runtime.ts";
import web from "./web/runtime.ts";
import { SkillCatalog } from "./skills/catalog.ts";
import { createSkillsModule } from "./skills/runtime.ts";

/** Composes only plugin business logic; the application owns loading, host services, and external plugin dependencies. */
export function createBuiltin(options: { application: BuiltinApplication; manualSources(): readonly ManualSource[]; connectNaming(api: NamingApi): () => void }) {
  return definePlugin({ namespace: builtin, version: metadata.version,
    setup(plugin) {
      const settings = plugin.config(BuiltinSettings);
      const skills = new SkillCatalog();
      // Backend assembly precedes task-process ready; the initial skill catalog is built during startup loading.
      skills.refresh(plugin.lifetime.signal);
      const shell = new ShellService(() => settings.get().shell, plugin.lifetime.signal);
      const usage = new UsageConsumer(plugin.modelProviders, plugin.usageProviders, providerId => {
        try { plugin.ipc.events.publish(UsageChanged, { providerId }); }
        catch (error) { if (!(error instanceof PluginApiError && error.code === "unavailable")) throw error; }
      });
      // The root entry registers before feature modules, and cleanup runs in reverse order: shared services are released after modules.
      plugin.lifetime.defer(() => usage.close());
      return { events: [UsageChanged],
        calls: [implementCall(ReadUsage, (input, { signal }) => usage.query(input.providerId, { refresh: input.refresh, signal }))],
        modules: [providers, createAgentModule(options.application, usage, skills), createSkillsModule(skills), createFilesystemModule(shell), createNamingModule(options.connectNaming, options.application.userAgent), notes, questions,
        resourceOperations, mcp, web, createManualModule(options.manualSources, options.application.name), createShellModule(() => settings.get().shell), createTerminalModule(() => settings.get().shell),
        defineAgentCreation({ id: CreateManual.id, creation: CreateManual,
          description: "Open the Asterism manual for software use and plugin development. Provides list, find, grep, and read over application guides, public package examples, and documentation exposed by loaded plugins.",
          guidelines: [] }),
        defineAgentCreation({ id: builtin.name("terminal.create"), creation: CreateTerminal,
          description: "Create a shared interactive terminal. Its shell and screen remain available between tool calls and while viewing other sessions.",
          guidelines: ["The terminal runs as the current OS user. Input, screen observation and waiting for the shell are separate resource tools.",
            "Removing the resource ends its shell and child processes. Application restart retains the resource configuration."] }),
        defineAgentCreation({ id: builtin.name("agent.create"), creation: CreateAgent,
          description: "Create an Agent with a selected agent configuration, optional model/thinking overrides, and initial resource links.",
          inputSchema: agentCreateSchema.extend({
            resources: z.array(z.string().min(1)).optional()
              .describe("IDs of resources to authorize for the new Agent, drawn from your current request's linked resources. Defaults to an empty list."),
            expose_self: z.boolean().optional()
              .describe("Authorize the new Agent to access you as a resource. Your identity is supplied by the host. Defaults to false."),
          }).describe("Agent configuration selection, optional title, and initial resource links."),
          toInput: ({ resources: _resources, expose_self: _exposeSelf, ...input }) => input,
          toOptions: ({ resources, expose_self }) => ({ resources, exposeSelf: expose_self }),
          guidelines: [
            "agent_list returns available agent configurations and their purposes.",
            "resource_list returns your linked resource IDs.",
            "Creation and all initial links are committed together. The new Agent uses its own configuration's tool policy.",
          ] }),
        defineAgentCreation({ id: builtin.name("note.create"), creation: CreateNote,
          description: "Create a note with a title and optional initial text.",
          guidelines: ["Notes store their current text."] }),
      ] };
    } });
}
export { createSelection } from "./agent/selection.ts";
export { composeSystemPrompt } from "./agent/system-prompt.ts";
export type { BuiltinApplication } from "./application.ts";
export { builtinMetadata } from "./metadata.ts";
