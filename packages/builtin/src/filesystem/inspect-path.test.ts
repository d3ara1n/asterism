import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectPath } from "./inspect-path.ts";
import { resolveLocalPath } from "./local-path.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), "path-inspection-")); roots.push(root);
  return root;
}
const signal = () => new AbortController().signal;

describe("Local path resolution", () => {
  it("expands the current home and normalizes parent components without a working directory", () => {
    expect(resolveLocalPath("~")).toBe(homedir());
    expect(resolveLocalPath("~/Projects/old/../new")).toBe(join(homedir(), "Projects", "new"));
    expect(resolveLocalPath(join(tmpdir(), "old", "..", "new"))).toBe(join(tmpdir(), "new"));
  });

  it("rejects relative paths and another user's home shorthand", () => {
    for (const path of ["Projects/new", "../new", "~someone/Projects"]) {
      expect(() => resolveLocalPath(path)).toThrow("Path must be absolute");
    }
  });
});

describe("Local path inspection", () => {
  it("reports an absent target as an observation rather than a failed operation", async () => {
    const path = join(setup(), "missing", "project");
    expect(await inspectPath(path, true, signal())).toEqual({ kind: "succeeded", data: {
      path, exists: false, type: null, size: null, modifiedAt: null, entries: null, truncated: false,
    } });
  });

  it("reports file byte size and UTC modification time even when a listing was requested", async () => {
    const path = join(setup(), "file.txt"); writeFileSync(path, "你好\n");
    const modified = new Date("2024-03-04T05:06:07.000Z"); utimesSync(path, modified, modified);
    expect(await inspectPath(path, true, signal())).toEqual({ kind: "succeeded", data: {
      path, exists: true, type: "file", size: 7, modifiedAt: modified.toISOString(), entries: null, truncated: false,
    } });
  });

  it("distinguishes an omitted listing from an empty directory and includes hidden entries", async () => {
    const path = setup();
    expect(await inspectPath(path, false, signal())).toMatchObject({ kind: "succeeded", data: { type: "directory", size: null, entries: null } });
    expect(await inspectPath(path, true, signal())).toMatchObject({ kind: "succeeded", data: { entries: [], truncated: false } });
    mkdirSync(join(path, ".git")); writeFileSync(join(path, ".env"), ""); writeFileSync(join(path, "readme.md"), "");
    const result = await inspectPath(path, true, signal());
    if (result.kind !== "succeeded") throw new Error("Expected a directory listing");
    expect(result.data.entries).toEqual(expect.arrayContaining([
      { name: ".git", type: "directory" }, { name: ".env", type: "file" }, { name: "readme.md", type: "file" },
    ]));
  });

  it("marks a capped listing incomplete instead of implying that all names were checked", async () => {
    const path = setup();
    for (let index = 0; index < 501; index++) writeFileSync(join(path, String(index)), "");
    const result = await inspectPath(path, true, signal());
    if (result.kind !== "succeeded") throw new Error("Expected a directory listing");
    expect(result.data.entries).toHaveLength(500);
    expect(result.data.truncated).toBe(true);
  });

  it("follows directory aliases for inspection but leaves links unfollowed in listings", async () => {
    const root = setup(), target = join(root, "target"), alias = join(root, "alias"); mkdirSync(target);
    writeFileSync(join(target, "file.txt"), "");
    symlinkSync(target, alias, "junction");
    expect(await inspectPath(alias, true, signal())).toMatchObject({ kind: "succeeded", data: {
      path: alias, exists: true, type: "directory", entries: [{ name: "file.txt", type: "file" }],
    } });
    const result = await inspectPath(root, true, signal());
    if (result.kind !== "succeeded") throw new Error("Expected a directory listing");
    expect(result.data.entries).toContainEqual({ name: "alias", type: "other" });
  });

  it("reports a broken link as unresolved while preserving its name in the parent listing", async () => {
    const root = setup(), broken = join(root, "broken"); symlinkSync(join(root, "missing"), broken, "junction");
    expect(await inspectPath(broken, false, signal())).toMatchObject({ kind: "succeeded", data: { exists: false, type: null } });
    const result = await inspectPath(root, true, signal());
    if (result.kind !== "succeeded") throw new Error("Expected a directory listing");
    expect(result.data.entries).toContainEqual({ name: "broken", type: "other" });
  });

  it("keeps invalid parents and relative paths distinct from absence", async () => {
    const path = join(setup(), "file.txt"); writeFileSync(path, "");
    expect(await inspectPath(join(path, "child"), false, signal())).toMatchObject({ kind: "failed", error: { code: "not_directory" } });
    expect(await inspectPath("relative", false, signal())).toMatchObject({ kind: "rejected", error: { code: "absolute_path" } });
  });
});
