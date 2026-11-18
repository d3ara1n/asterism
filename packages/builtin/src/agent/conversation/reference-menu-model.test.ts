import { describe, expect, it } from "vitest";
import { filterTargets, menuRows, rankSkills } from "./reference-menu-model";

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

  it("matches resource titles at the root and keeps Skills isolated in its category", () => {
    const skills = [skill("ads"), skill("pricing")];
    const directory = { ref: { sessionId: "s", id: "r", kind: "directory" }, title: "Ad assets", data: {} };
    expect(menuRows({ level: "root" }, "ad", skills, [directory])).toEqual([
      { kind: "skill", skill: skills[0] }, { kind: "resource", resource: directory },
    ]);
    expect(menuRows({ level: "category", category: "skills" }, "ad", skills, [directory])).toEqual([{ kind: "skill", skill: skills[0] }]);
  });

  it("filters the label and explicit keywords in source order, not presentation detail or locations", () => {
    const items = [
      { label: "Write tests", keywords: ["QA-17"], location: "items/17" },
      { label: "QA follow-up", location: "items/18" },
      { label: "Review", detail: "QA", location: "items/QA" },
    ];
    expect(filterTargets(items, " QA ")).toEqual(items.slice(0, 2));
  });
});
