import { z } from "zod";
import { definePlugin, implementCall, PluginApiError } from "@atelier/sdk/runtime";
import { builtin, CreateAgent, agentCreateSchema, type NamingApi } from "@atelier/builtin-api/contracts";
import { defineAgentCreation } from "@atelier/builtin-api/runtime";
import metadata from "../package.json" with { type: "json" };
import type { BuiltinApplication } from "./application.ts";
import { createAgentModule } from "./agent/runtime.ts";
import filesystem from "./filesystem/runtime.ts";
import notes from "./notes/runtime.ts";
import { BuiltinSettings } from "./settings/contract.ts";
import { createNamingModule } from "./naming/runtime.ts";
import questions from "./questions/runtime.ts";
import resourceOperations from "./resources/runtime.ts";
import { CreateNote } from "./notes/contract.ts";
import providers from "./providers/runtime.ts";
import { UsageConsumer } from "./usage/service.ts";
import { ReadUsage, UsageChanged } from "./usage/contract.ts";

/** 仅组合插件业务；加载、宿主服务及外部插件依赖由应用负责。 */
export function createBuiltin(options: { application: BuiltinApplication; connectNaming(api: NamingApi): () => void }) {
  return definePlugin({ namespace: builtin, version: metadata.version,
    setup(plugin) {
      plugin.config(BuiltinSettings);
      const usage = new UsageConsumer(plugin.providers, plugin.usages, providerId => {
        try { plugin.ipc.events.publish(UsageChanged, { providerId }); }
        catch (error) { if (!(error instanceof PluginApiError && error.code === "unavailable")) throw error; }
      });
      plugin.signal.addEventListener("abort", () => usage.close(), { once: true });
      return { events: [UsageChanged],
        calls: [implementCall(ReadUsage, (input, { signal }) => usage.query(input.providerId, { refresh: input.refresh, signal }))],
        async closing() { usage.close(); },
        modules: [providers, createAgentModule(options.application, usage), filesystem, createNamingModule(options.connectNaming, options.application.userAgent), notes, questions,
        resourceOperations,
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
