import { describe, expect, it } from "vitest";
import { parseResourceLink, resourceLink } from "./resource-links.ts";

describe("Resource location links", () => {
  it("encodes and decodes a resource-relative file path", () => {
    expect(resourceLink("Project-A", "docs/design notes.md"))
      .toBe("resource:Project-A/docs/design%20notes.md");
    expect(parseResourceLink("resource:Project-A/docs/design%20notes.md")).toEqual({
      resourceId: "Project-A", location: "docs/design notes.md",
    });
  });

  it("encodes a location with special characters in path segments", () => {
    expect(resourceLink("Dir-A", "reports/a%20file.md"))
      .toBe("resource:Dir-A/reports/a%2520file.md");
    expect(parseResourceLink("resource:Dir-A/reports/a%2520file.md"))
      .toEqual({ resourceId: "Dir-A", location: "reports/a%20file.md" });
  });

  it("keeps case, punctuation and an empty resource-defined location", () => {
    expect(parseResourceLink("resource:AbC%2F%3F%25/",)).toEqual({ resourceId: "AbC/?%", location: "" });
  });

  it("rejects malformed addresses", () => {
    for (const value of ["resource:abc", "resource://abc/path", "file:///etc/passwd", "skill:abc"]) {
      expect(parseResourceLink(value)).toBeNull();
    }
  });
});
