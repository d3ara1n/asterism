import { describe, expect, it } from "vitest";
import { menuRows, rankSkills } from "./reference-menu-model";

const skill = (name: string, description = "") => ({ name, description });

describe("Reference menu", () => {
  it("ranks name matches by exactness before description matches", () => {
    const skills = [skill("copy-editing", "polish seo copy"), skill("ai-seo"), skill("seo-audit"), skill("seo"), skill("myseo")];
    expect(rankSkills(skills, "seo").map(s => s.name)).toEqual(["seo", "seo-audit", "ai-seo", "myseo", "copy-editing"]);
  });

  it("keeps catalog order within a tier and drops non-matches", () => {
    const skills = [skill("pricing-b"), skill("ads"), skill("pricing-a")];
    expect(rankSkills(skills, "PRI").map(s => s.name)).toEqual(["pricing-b", "pricing-a"]);
  });

  it("lists categories at an empty root and searches items otherwise", () => {
    const skills = [skill("ads"), skill("pricing")];
    expect(menuRows({ level: "root" }, "", skills)).toEqual([{ kind: "category", category: "skills", count: 2 }]);
    expect(menuRows({ level: "root" }, "ad", skills)).toEqual([{ kind: "skill", skill: skills[0] }]);
    expect(menuRows({ level: "category", category: "skills" }, "", skills)).toHaveLength(2);
  });
});
