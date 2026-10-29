import { builtin, type AgentConfiguration } from "@asterism-app/builtin-api/contracts";
import { captureAgentPreparers, type AgentPromptBlock } from "@asterism-app/builtin-api/runtime";
import type { PluginContext } from "@asterism-app/sdk/runtime";
import type { PromptFile } from "@asterism-app/sdk/contracts";
import { skillCatalogPrompt, type SkillCatalog } from "../skills/catalog.ts";
import { projectAgentPrompt } from "./system-prompt.ts";

/** Capture catalog and preparers before awaiting linked context; prepare once for this request. */
export function createRequestAssembly(plugin: PluginContext, catalog: SkillCatalog) {
  return (agent: Pick<AgentConfiguration, "id" | "systemPrompt">) => {
    const instructions = plugin.agentCatalog.instructions(), skills = catalog.skills(), prepare = captureAgentPreparers(plugin);
    return (files: readonly PromptFile[] = []) => {
      // Preparers edit these lists in place; each projection builds its own.
      const blocks: AgentPromptBlock[] = [
        ...instructions.map(({ id, plugin: owner, text }): AgentPromptBlock => ({ id, kind: "system", from: owner, text, source: { id, plugin: owner } })),
        { id: builtin.name("agent"), kind: "agent", role: agent.id, text: agent.systemPrompt, source: { id: agent.id, plugin: plugin.id } },
        ...files.map(({ file, text }, index): AgentPromptBlock => ({ id: builtin.name(`context.${index}`), kind: "context", file, text, source: { id: file, plugin: null } })),
      ];
      const prepared = prepare({ skills, blocks });
      if (prepared.skills.length) prepared.blocks.push(skillCatalogPrompt(prepared.skills));
      return { ...prepared, system: projectAgentPrompt(prepared.blocks) };
    };
  };
}
