import { definePlugin, implementCall, PluginApiError } from "@atelier/sdk/runtime";
import { builtin, CreateAgent, type NamingApi } from "@atelier/builtin-api/contracts";
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
          description: "Create an Agent with a selected agent configuration and optional model/thinking overrides.",
          guidelines: ["Use an existing agent configuration ID. Null model and thinking selections use that configuration's defaults.",
            "The Agent starts without input or linked resources. Creating it does not send a task or copy your access."] }),
        defineAgentCreation({ id: builtin.name("note.create"), creation: CreateNote,
          description: "Create a note with a title and optional initial text.",
          guidelines: ["Notes store their current text. Removing a note retains its history but does not provide content rollback."] }),
      ] };
    } });
}
export { createSelection } from "./agent/selection.ts";
export { composeSystemPrompt } from "./agent/system-prompt.ts";
export type { BuiltinApplication } from "./application.ts";
export { builtinMetadata } from "./metadata.ts";
