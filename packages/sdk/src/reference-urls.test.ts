import { describe, expect, it } from "vitest";
import { parseResourceUrl, parseSkillUrl, resourceUrl, skillUrl } from "./reference-urls.ts";

describe("Resource URLs", () => {
  it("encodes each location segment and keeps `/` as the separator", () => {
    expect(resourceUrl("Project-A", "docs/design notes.md")).toBe("resource:Project-A/docs/design%20notes.md");
    expect(parseResourceUrl("resource:Project-A/docs/design%20notes.md"))
      .toEqual({ resourceId: "Project-A", location: "docs/design notes.md" });
  });

  it("round-trips literal percent signs in a location", () => {
    expect(resourceUrl("Dir-A", "reports/a%20file.md")).toBe("resource:Dir-A/reports/a%2520file.md");
    expect(parseResourceUrl("resource:Dir-A/reports/a%2520file.md")).toEqual({ resourceId: "Dir-A", location: "reports/a%20file.md" });
  });

  it("keeps case, punctuation and an empty resource-defined location", () => {
    expect(parseResourceUrl("resource:AbC%2F%3F%25/")).toEqual({ resourceId: "AbC/?%", location: "" });
  });

  it("rejects malformed addresses", () => {
    for (const value of ["resource:abc", "resource://abc/path", "resource:abc/%XX", "file:///etc/passwd", "skill:abc"])
      expect(parseResourceUrl(value)).toBeNull();
  });
});

describe("Skill URLs", () => {
  it("addresses SKILL.md by name and other files by package-relative path", () => {
    expect(skillUrl("pricing")).toBe("skill:pricing");
    expect(parseSkillUrl("skill:pricing")).toEqual({ name: "pricing", path: undefined });
    expect(skillUrl("a b", "refs/x y.md")).toBe("skill:a%20b/refs/x%20y.md");
    expect(parseSkillUrl("skill:a%20b/refs/x%20y.md")).toEqual({ name: "a b", path: "refs/x y.md" });
  });

  it("rejects malformed addresses", () => {
    for (const value of ["resource:abc/path", "file:///etc/passwd", "", "skill:", "skill:/path", "skill:a/%XX"])
      expect(parseSkillUrl(value)).toBeNull();
  });
});
