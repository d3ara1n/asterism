import { describe, expect, it } from "vitest";
import type { AgentSkill } from "@asterism-app/sdk/runtime";
import { referencedSkillNames, referencedSkills } from "./usage.ts";

const skill = (name: string, source: string): AgentSkill =>
  ({ name, description: "", directory: `/${source}/${name}`, source: { id: source, plugin: null, directory: `/${source}` } });

describe("Skill reference usage", () => {
  // Package-file references name the same skill; resource and model links and malformed destinations name none.
  it("collects each referenced skill name once across messages", () => {
    expect(referencedSkillNames([
      "Use [pricing](skill:pricing) and [notes:SKILL.md](skill:pricing/refs/notes.md).",
      "[a b](skill:a%20b) [file](resource:dir/a.md) [m](model:p/m) [bad](skill:%zz) plain skill:loose",
    ])).toEqual(["pricing", "a b"]);
  });

  it("resolves sources through the request's effective skills and keeps unknown names unresolved", () => {
    expect(referencedSkills(["pricing", "gone"], [skill("pricing", "/user")])).toEqual([
      { kind: "skill", id: "pricing", relation: "referenced", source: "/user" },
      { kind: "skill", id: "gone", relation: "referenced", source: null },
    ]);
  });
});
