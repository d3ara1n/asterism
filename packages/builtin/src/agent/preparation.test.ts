import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  it.each(["", " \n "])("omits an empty role without losing resource context, and includes user-written instructions: %j", async systemPrompt => {
    const sessions: SessionDirectory = { list: () => [], sleeping: () => [], archived: () => [] };
    const catalog: AgentCatalog = { skills: () => [], instructions: () => [], refresh: () => [], read: async () => "" };
    const home = await mkdtemp(join(tmpdir(), "asterism-agent-home-"));
    try {
      const assemble = createRequestAssembly(context("asterism.builtin", sessions, catalog, new AbortController()), new SkillCatalog(catalog), home);
      const files = [{ file: "/project/AGENTS.md", text: "Project context" }];
      const empty = (await assemble.forRequest({ id: "general", systemPrompt }))(files);
      expect(empty.blocks.map(block => block.kind)).toEqual(["context"]);
      expect(empty.system.blocks.map(block => block.text)).toEqual(['<context file="/project/AGENTS.md">\nProject context\n</context>']);
      const written = (await assemble.forRequest({ id: "general", systemPrompt: "My instructions" }))(files);
      expect(written.system.blocks.map(block => block.text)).toEqual([
        '<agent role="general">\nMy instructions\n</agent>', '<context file="/project/AGENTS.md">\nProject context\n</context>',
      ]);
    } finally { await rm(home, { recursive: true, force: true }); }
  });

  it("reads global guidance anew even after the linked directory is detached", async () => {
    const sessions: SessionDirectory = { list: () => [], sleeping: () => [], archived: () => [] };
    const catalog: AgentCatalog = { skills: () => [], instructions: () => [], refresh: () => [], read: async () => "" };
    const home = await mkdtemp(join(tmpdir(), "asterism-agent-home-"));
    try {
      const directory = join(home, ".agents");
      await mkdir(directory);
      const file = join(directory, "AGENTS.md");
      await writeFile(file, "Personal defaults");
      const globalPath = await realpath(file);
      const assemble = createRequestAssembly(context("asterism.builtin", sessions, catalog, new AbortController()), new SkillCatalog(catalog), home);
      const role = { id: "general", systemPrompt: "" };
      const first = await assemble.forRequest(role);
      const project = { file: "/project/AGENTS.md", text: "Project guidance" };
      expect(first([project, { file: globalPath, text: "Personal defaults" }]).blocks).toMatchObject([
        { kind: "context", file: globalPath, text: "Personal defaults" },
        { kind: "context", ...project },
      ]);
      await writeFile(file, "Updated defaults");
      expect((await assemble.forRequest(role))([]).blocks).toMatchObject([
        { kind: "context", file: globalPath, text: "Updated defaults" },
      ]);
    } finally { await rm(home, { recursive: true, force: true }); }
  });

  it("composes preparers in registration order, keeps provenance, and isolates prepared results", () => {
    const sessions: SessionDirectory = { list: () => [], sleeping: () => [], archived: () => [] };
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
    const prepared = assemble.estimate({ id: "worker", systemPrompt: "Work" });
    expect(prepared.skills.map(skill => [skill.name, skill.source.plugin])).toEqual([["keep", "example.skills"]]);
    expect(prepared.blocks[0]).toMatchObject({ text: "Edited after filtering", source: { id: "example.instructions:one", plugin: "example.instructions" } });
    retained!.blocks[0]!.text = "Later mutation";
    expect(prepared.system.blocks[0]!.text).toContain("Edited after filtering");
    expect(prepared.system.blocks[0]!.text).not.toContain("Later mutation");
    second.abort(); first.abort();
    expect(assemble.estimate({ id: "worker", systemPrompt: "Work" }).blocks[0]!.text).toBe("Original");
  });
});
