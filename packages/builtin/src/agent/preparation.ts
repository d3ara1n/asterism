import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { builtin, type AgentConfiguration } from "@asterism-app/builtin-api/contracts";
import { captureAgentPreparers, type AgentPromptBlock } from "@asterism-app/builtin-api/runtime";
import type { PluginContext } from "@asterism-app/sdk/runtime";
import type { PromptFile } from "@asterism-app/sdk/contracts";
import { skillCatalogPrompt, type SkillCatalog } from "../skills/catalog.ts";
import { projectAgentPrompt } from "./system-prompt.ts";
import { readAgentContext } from "../filesystem/agent-context.ts";

type Agent = Pick<AgentConfiguration, "id" | "systemPrompt">;

async function readGlobalAgentContext(home: string) {
  try { return await readAgentContext(await realpath(join(home, ".agents", "AGENTS.md"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function createRequestAssembly(plugin: PluginContext, catalog: SkillCatalog, home = homedir()) {
  function capture(agent: Agent) {
    const instructions = plugin.agentCatalog.instructions(), skills = catalog.skills(), prepare = captureAgentPreparers(plugin);
    return (files: readonly PromptFile[] = []) => {
      // Preparers edit these lists in place; each projection builds its own.
      const blocks: AgentPromptBlock[] = [
        ...instructions.map(({ id, plugin: owner, text }): AgentPromptBlock => ({
          id, kind: "system", from: owner,
          text,
          source: { id, plugin: owner },
        })),
        ...(agent.systemPrompt.trim() ? [{
          id: builtin.name("agent"), kind: "agent" as const, role: agent.id,
          text: agent.systemPrompt, source: { id: agent.id, plugin: plugin.id },
        }] : []),
        ...files.map(({ file, text }, index): AgentPromptBlock => ({ id: builtin.name(`context.${index}`), kind: "context", file, text, source: { id: file, plugin: null } })),
      ];
      const prepared = prepare({ skills, blocks });
      const catalogBlock = prepared.skills.length ? skillCatalogPrompt(prepared.skills) : null;
      if (catalogBlock) prepared.blocks.push(catalogBlock);
      return { ...prepared, catalogBlock, system: projectAgentPrompt(prepared.blocks) };
    };
  }
  return {
    // Admission and compression estimates do not load file context.
    estimate: (agent: Agent) => capture(agent)(),
    async forRequest(agent: Agent) {
      const assemble = capture(agent);
      const global = await readGlobalAgentContext(home);
      return (files: readonly PromptFile[] = []) => assemble(global
        ? [global, ...files.filter(file => file.file !== global.file)] : files);
    },
  };
}
