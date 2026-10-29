import { describe, expect, it } from "vitest";
import { defineAgentPreparer } from "@asterism-app/builtin-api/runtime";
import type { AgentCatalog, PluginContext } from "@asterism-app/sdk/runtime";
import type { SessionDirectory } from "@asterism-app/sdk/contracts";
import { createRequestAssembly } from "./preparation.ts";
import { SkillCatalog } from "../skills/catalog.ts";

function context(id: string, sessions: SessionDirectory, catalog: AgentCatalog, controller: AbortController): PluginContext {
  return { id, sessions, agentCatalog: catalog, lifetime: { signal: controller.signal } } as PluginContext;
}
describe("Agent request preparation", () => {
  it("composes preparers in registration order, keeps provenance, and isolates prepared results", () => {
    const sessions: SessionDirectory = { list: () => [], archived: () => [] };
    const source = { id: "example.skills:main", plugin: "example.skills", directory: "/skills" };
    const catalog: AgentCatalog = {
      skills: () => [{ ...source, issues: [], skills: ["keep", "remove"].map(name => ({ name, description: name, directory: `/skills/${name}`, source })) }],
      instructions: () => [{ id: "example.instructions:one", plugin: "example.instructions", text: "Original" }],
      refresh: () => [], read: async () => "",
    };
    const first = new AbortController(), second = new AbortController();
    defineAgentPreparer({ id: "filter", prepare(value) {
      value.skills = value.skills.filter(skill => skill.name === "keep");
      value.blocks[0]!.text = "Edited";
    } }).setup(context("example.first", sessions, catalog, first));
    let retained: import("@asterism-app/builtin-api/runtime").AgentPreparation | undefined;
    defineAgentPreparer({ id: "append", prepare(value) {
      expect(value.blocks[0]!.text).toBe("Edited");
      value.blocks[0]!.text += " after filtering";
      retained = value;
    } }).setup(context("example.second", sessions, catalog, second));
    const assemble = createRequestAssembly(context("asterism.builtin", sessions, catalog, new AbortController()), new SkillCatalog(catalog));
    const prepared = assemble({ id: "worker", systemPrompt: "Work" })();
    expect(prepared.skills.map(skill => [skill.name, skill.source.plugin])).toEqual([["keep", "example.skills"]]);
    expect(prepared.blocks[0]).toMatchObject({ text: "Edited after filtering", source: { id: "example.instructions:one", plugin: "example.instructions" } });
    retained!.blocks[0]!.text = "Later mutation";
    expect(prepared.system.blocks[0]!.text).toContain("Edited after filtering");
    expect(prepared.system.blocks[0]!.text).not.toContain("Later mutation");
    second.abort(); first.abort();
    expect(assemble({ id: "worker", systemPrompt: "Work" })().blocks[0]!.text).toBe("Original");
  });
});
