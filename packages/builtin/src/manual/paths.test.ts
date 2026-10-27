import { describe, expect, it } from "vitest";
import { manualPath } from "./paths.ts";

const sources = [
  { path: "app", directory: "/application/docs" },
  { path: "sdk/docs", directory: "/sdk/docs" },
  { path: "sdk/examples", directory: "/sdk/examples" },
  { path: "plugins/example.bridge/docs", directory: "/bridge/docs" },
];

describe("Manual source paths", () => {
  // Virtual parents enumerate unique children and search only their descendants, without matching partial source names.
  it("routes virtual ancestors and source-local paths to distinct source directories", () => {
    expect(manualPath(sources, ".")).toMatchObject({ kind: "directory", entries: ["app", "sdk", "plugins"] });
    expect(manualPath(sources, "sdk")).toEqual({
      kind: "directory", path: "sdk", entries: ["docs", "examples"],
      scopes: [{ source: sources[1], path: "." }, { source: sources[2], path: "." }],
    });
    expect(manualPath(sources, "sdk\\docs\\usage.md")).toEqual({
      kind: "source", path: "sdk/docs/usage.md", scope: { source: sources[1], path: "usage.md" },
    });
    expect(manualPath(sources, "plugins/example.bridge/docs/usage.md")).toEqual({
      kind: "source", path: "plugins/example.bridge/docs/usage.md", scope: { source: sources[3], path: "usage.md" },
    });
    expect(() => manualPath(sources, "sdk/docs-other")).toThrow("does not exist");
    expect(manualPath(sources, "sdk/docs")).toMatchObject({ kind: "source", scope: { path: "." } });
  });

  // Absolute paths and traversal above the virtual root must never become host filesystem targets.
  it("rejects paths outside the virtual root and keeps empty catalogs readable", () => {
    for (const path of ["../secret", "sdk/../../secret", "/etc/passwd", "C:\\private\\file", "\\\\server\\share", "bad\0path"])
      expect(() => manualPath(sources, path)).toThrow("within the manual");
    expect(manualPath([], ".")).toEqual({ kind: "directory", path: ".", entries: [], scopes: [] });
    expect(() => manualPath([], "plugins/example.bridge/docs")).toThrow("does not exist");
  });
});
