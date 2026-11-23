import { describe, expect, it } from "vitest";
import type { SubjectRow } from "../../../shared/telemetry";
import type { SkillSource } from "../../../shared/skills";
import { catalogLoad, catalogSkills, unusedSkills } from "./skills";

const source = (id: string, names: string[]): SkillSource => ({ id, plugin: null, directory: id, issues: [],
  skills: names.map(name => ({ name, description: "", directory: `${id}/${name}`, source: { id, plugin: null, directory: id } })) });
const row = (id: string, lastAt: number | null, sourceId: string | null = "/user"): SubjectRow =>
  ({ id, source: sourceId, requests: 1, sessions: 1, lastAt, relations: {}, unprompted: 0, parts: [], failedCalls: 0 });

describe("Skill usage insight", () => {
  // A skill shadowed in another source is one name to the user; counting each copy would list the shadowed copy as unused forever.
  it("lists unused catalog names by name, longest unused first, with never-recorded skills leading", () => {
    const catalog = catalogSkills([source("/user", ["a", "b", "c"]), source("plugin:x", ["a", "d"])]);
    expect(catalog.find(skill => skill.name === "a")?.sources).toEqual(["/user", "plugin:x"]);
    const unused = unusedSkills(catalog, [row("a", 900, "plugin:x")], [row("a", 900), row("b", 300), row("c", 100), row("c", 200, null)]);
    expect(unused.map(skill => [skill.name, skill.lastAt])).toEqual([["d", null], ["c", 200], ["b", 300]]);
  });

  it("averages catalog characters over the requests that carried it and bounds the estimated input share", () => {
    expect(catalogLoad({ quantity: 8_000, requests: 2 }, 10_000)).toEqual({ characters: 4_000, share: 0.2 });
    expect(catalogLoad({ quantity: 8_000, requests: 2 }, 100)?.share).toBe(1);
    expect(catalogLoad({ quantity: 8_000, requests: 2 }, 0)).toEqual({ characters: 4_000, share: null });
    expect(catalogLoad({ quantity: null, requests: 2 }, 10)).toBeNull();
    expect(catalogLoad(undefined, 10)).toBeNull();
  });
});
