import { describe, expect, it } from "vitest";
import type { AgentSkillSource } from "@asterism-app/sdk/runtime";
import { effectiveSkills } from "./catalog.ts";

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
});
