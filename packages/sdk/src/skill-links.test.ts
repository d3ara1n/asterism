import { describe, expect, it } from "vitest";
import { parseSkillLink, skillLink } from "./skill-links.ts";

describe("Skill links", () => {
  it("encodes a skill name with default SKILL.md", () => {
    expect(skillLink("pricing")).toBe("skill:pricing");
    expect(parseSkillLink("skill:pricing")).toEqual({ name: "pricing", path: undefined });
  });

  it("encodes a skill name with a package-relative file path", () => {
    expect(skillLink("pricing", "guide.md")).toBe("skill:pricing/guide.md");
    expect(parseSkillLink("skill:pricing/guide.md")).toEqual({ name: "pricing", path: "guide.md" });
  });

  it("percent-encodes special characters in name and path", () => {
    expect(skillLink("a b", "refs/x y.md")).toBe("skill:a%20b/refs/x%20y.md");
    expect(parseSkillLink("skill:a%20b/refs/x%20y.md")).toEqual({ name: "a b", path: "refs/x y.md" });
  });

  it("rejects malformed addresses", () => {
    for (const value of ["resource:abc/path", "file:///etc/passwd", "", "skill:", "skill:/path", "skill:a/%XX"]) {
      expect(parseSkillLink(value)).toBeNull();
    }
  });
});
