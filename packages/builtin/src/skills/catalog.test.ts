import { describe, expect, it } from "vitest";
import type { AgentCatalog, AgentSkillSource } from "@asterism-app/sdk/runtime";
import { effectiveSkills, SkillCatalog } from "./catalog.ts";
import { readToModel } from "../shared/text.ts";

const signal = new AbortController().signal;
function source(plugin: string | null, names: string[], id = plugin ?? "/user") : AgentSkillSource {
  const identity = { id, plugin, directory: `/${id}` };
  return { ...identity, issues: [], skills: names.map(name => ({ name, description: `${id} ${name}`, directory: `/${id}/${name}`, source: identity })) };
}

describe("builtin skill preparation", () => {
  it("selects user above plugin above builtin and orders plugin conflicts deterministically", () => {
    const sources = [source(null, ["shared"]), source("z.plugin", ["shared", "plugin"]), source("asterism.builtin", ["shared", "plugin", "default"]), source("a.plugin", ["plugin"])];
    expect(effectiveSkills(sources).map(skill => [skill.name, skill.source.plugin])).toEqual([
      ["default", "asterism.builtin"], ["plugin", "z.plugin"], ["shared", null],
    ]);
    expect(effectiveSkills([...sources].reverse())).toEqual(effectiveSkills(sources));
  });

  it("rejects removed skills and retains prepared bindings while the shared sources refresh", async () => {
    let sources = [source("a.plugin", ["guide", "removed"])];
    const host: AgentCatalog = { skills: () => sources, instructions: () => [], refresh: () => sources,
      read: async skill => `${skill.source.plugin}\nSecond\nThird\n` };
    const catalog = new SkillCatalog(host);
    const prepared = catalog.skills().filter(skill => skill.name !== "removed");
    const args = { name: "guide", path: "SKILL.md", offset: 1, limit: 2 };
    await catalog.during("agent", async bind => {
      bind(prepared);
      sources = [source("z.plugin", ["guide", "removed"])];
      catalog.refresh(signal);
      expect(catalog.skills()[0]!.source.plugin).toBe("z.plugin");
      const read = await catalog.read("agent", args, signal);
      expect(read.rows.map(row => row.content)).toEqual(["a.plugin", "Second"]);
      expect(readToModel(read, "offset")).toContain("Remaining content starts at offset:3.");
      await expect(catalog.read("agent", { ...args, name: "removed" }, signal)).rejects.toMatchObject({ reason: "skill_not_found" });
    });
    await expect(catalog.read("agent", args, signal)).rejects.toMatchObject({ reason: "skill_not_found" });
  });
});
