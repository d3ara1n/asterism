import { z } from "zod";
import { definePlugin, defineAgentInstructions, implementCall } from "@asterism-app/sdk/runtime";
import { builtin, CreateAgent, agentCreateSchema } from "@asterism-app/builtin-api/contracts";
import { defineAgentCreation } from "@asterism-app/builtin-api/runtime";
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
import { createShellModule } from "./shell/runtime.ts";
import { createTerminalModule } from "./terminal/runtime.ts";
import { CreateTerminal } from "./terminal/contract.ts";
import mcp from "./mcp/runtime.ts";
import web from "./web/runtime.ts";
import { SkillCatalog } from "./skills/catalog.ts";
import { createSkillsModule } from "./skills/runtime.ts";
import mesh from "./mesh/runtime.ts";
import { CreateMesh } from "./mesh/contract.ts";
import { environment } from "./agent/system-prompt.ts";
import { UpdateParadigmConfiguration } from "./configuration/contract.ts";
import { resolveParadigmConfiguration } from "./configuration/state.ts";
import { updateParadigmConfiguration } from "./configuration/runtime.ts";

/** Composes only plugin business logic; the application owns loading, host services, and external plugin dependencies. */
export default definePlugin({ namespace: builtin,
    setup(plugin) {
      const application = plugin.application;
      const settings = plugin.config(BuiltinSettings);
      const skills = new SkillCatalog(plugin.agentCatalog);
      const usage = plugin.providerUsage;
      return {
        calls: [
          implementCall(UpdateParadigmConfiguration, async input => {
            settings.update(current => ({ ...current, paradigm: updateParadigmConfiguration(current.paradigm, input) }));
            return { snapshot: resolveParadigmConfiguration(settings.get().paradigm), savedId: input.type === "remove" ? null : input.value.id };
          })],
        modules: [defineAgentInstructions([{ id: "environment", text: environment(application.name).text }]),
        providers, createAgentModule(application, usage, skills), createSkillsModule(skills), createFilesystemModule(plugin.commands), createNamingModule(application.userAgent), notes, questions,
        resourceOperations, mcp, web, mesh, createManualModule(() => plugin.manual.sources(), application.name), createShellModule(), createTerminalModule(),
        defineAgentCreation({ id: CreateMesh.id, creation: CreateMesh,
          description: "Create a Mesh resource in the default channel. Mesh provides list, send, peek, get_profile, and set_profile for Agents exposed to its channel across sessions.",
          guidelines: ["The Mesh card selects its channel. Link direction independently controls use of the Mesh and exposure of Agents to its channel."] }),
        defineAgentCreation({ id: CreateManual.id, creation: CreateManual,
          description: "Open the Asterism manual for software use and plugin development. Provides list, find, grep, and read over application guides, public package examples, and documentation exposed by loaded plugins.",
          guidelines: [] }),
        defineAgentCreation({ id: CreateTerminal.id, creation: CreateTerminal,
          description: "Create a shared interactive terminal. Its shell and screen remain available between tool calls and while viewing other sessions.",
          guidelines: ["The terminal runs as the current OS user. Input, screen observation and waiting for the shell are separate resource tools.",
            "Removing the resource ends its shell and child processes. Application restart retains the resource configuration."] }),
        defineAgentCreation({ id: CreateAgent.id, creation: CreateAgent,
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
        defineAgentCreation({ id: CreateNote.id, creation: CreateNote,
          description: "Create a note with a title and optional initial text.",
          guidelines: ["Notes store their current text."] }),
      ] };
    } });
