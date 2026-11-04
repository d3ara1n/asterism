import { describe, expect, it } from "vitest";
import { parseResourceLink, resourceLink } from "./resource-links.ts";

describe("Resource location links", () => {
  it("decodes a resource-relative filename without treating it as a host path", () => {
    expect(parseResourceLink("resource:Project-A?location=docs%2Fdesign%20notes.md")).toEqual({
      resourceId: "Project-A", location: "docs/design notes.md",
    });
  });

  it("preserves opaque URL locations, including their own escapes, queries and fragments", () => {
    expect(resourceLink("Browser-A", "https://example.com/a%20b?q=one&mode=two#part"))
      .toBe("resource:Browser-A?location=https%3A%2F%2Fexample.com%2Fa%2520b%3Fq%3Done%26mode%3Dtwo%23part");
    expect(parseResourceLink("resource:Browser-A?location=https%3A%2F%2Fexample.com%2Fa%2520b%3Fq%3Done%26mode%3Dtwo%23part"))
      .toEqual({ resourceId: "Browser-A", location: "https://example.com/a%20b?q=one&mode=two#part" });
  });

  it("keeps case, punctuation and an empty resource-defined location", () => {
    expect(parseResourceLink("resource:AbC%2F%3F%25?location=")).toEqual({ resourceId: "AbC/?%", location: "" });
  });

  it("rejects malformed addresses and ambiguous extra URL fields", () => {
    for (const value of ["resource:?location=file", "resource:abc", "resource://abc?location=x",
      "resource:abc?path=x", "resource:abc?location=x&other=y", "resource:abc?location=x#fragment",
      "resource:abc?location=%XX", "resource:%E0%A4?location=x", "file:///etc/passwd"]) {
      expect(parseResourceLink(value)).toBeNull();
    }
  });
});
