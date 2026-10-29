import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentCatalogService, packageAsset, parseSkillMetadata } from "./agent-catalog.ts";

const roots: string[] = [];
const signal = new AbortController().signal;
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "asterism-skills-"))); roots.push(base);
  const source = join(base, "skills"); mkdirSync(source);
  return { base, source, catalog: new AgentCatalogService([source]) };
}
function skill(source: string, directory: string, name = directory, description = "A useful skill") {
  const root = join(source, directory); mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nInstructions\n`);
  return root;
}

describe("host skill sources", () => {
  it("parses quoted and multiline YAML without confusing body examples for metadata", () => {
    expect(parseSkillMetadata('\uFEFF---\r\nname: "code-review"\r\ndescription: >-\r\n  Review changes:\r\n  correctness and tests.\r\nmetadata:\r\n  owner: someone\r\n---\r\nname: wrong'))
      .toEqual({ name: "code-review", description: "Review changes: correctness and tests." });
    for (const text of ["---\nname: a\nname: b\ndescription: test\n---", "---\nname: [a]\ndescription: test\n---",
      "---\nname: a\ndescription: ''\n---", "Body\n---\nname: a\ndescription: test\n---", "---\nname: a\ndescription: test"])
      expect(() => parseSkillMetadata(text)).toThrow();
  });

  it("refreshes explicitly and isolates invalid or ambiguous entries within a source", () => {
    const { source, catalog } = setup();
    const a = skill(source, "a"); skill(source, "one", "same"); skill(source, "two", "same");
    const broken = skill(source, "broken"); writeFileSync(join(broken, "SKILL.md"), "---\nname: broken\n---");
    const first = catalog.refresh(signal);
    expect(first[0]!.skills.map(skill => skill.name)).toEqual(["a"]);
    expect(first[0]!.issues.map(issue => issue.file).sort()).toEqual([join(broken, "SKILL.md"), join(source, "one", "SKILL.md"), join(source, "two", "SKILL.md")].sort());
    writeFileSync(join(a, "SKILL.md"), "---\nname: renamed\ndescription: Updated\n---");
    expect(catalog.skills()).toEqual(first);
    expect(catalog.refresh(signal)[0]!.skills.map(skill => skill.name)).toEqual(["renamed"]);
  });

  it("retains same-name entries across sources with actual contributor provenance", () => {
    const { base, source, catalog } = setup();
    skill(source, "shared"); const pluginRoot = join(base, "package"); skill(join(pluginRoot, "skills"), "shared");
    catalog.register("example.plugin", { path: path => packageAsset(pluginRoot, path) }, [{ id: "guides", path: "skills" }], [{ id: "environment", text: "Plugin environment" }]);
    const sources = catalog.refresh(signal);
    expect(sources.map(source => source.skills.map(skill => [skill.name, skill.source.plugin]))).toEqual([[["shared", null]], [["shared", "example.plugin"]]]);
    expect(catalog.instructions()).toEqual([{ id: "example.plugin:environment", plugin: "example.plugin", text: "Plugin environment" }]);
    catalog.remove("example.plugin");
    expect(catalog.skills().map(source => source.plugin)).toEqual([null]);
    expect(catalog.instructions()).toEqual([]);
  });

  it("keeps a captured package binding across a source refresh", async () => {
    const { source, catalog } = setup();
    const old = skill(source, "old", "guide");
    const captured = catalog.refresh(signal)[0]!.skills[0]!;
    writeFileSync(join(old, "SKILL.md"), "---\nname: retired\ndescription: Old package\n---\nOld instructions");
    skill(source, "new", "guide", "New package"); catalog.refresh(signal);
    expect(await catalog.read(captured, "SKILL.md", signal)).toContain("Old instructions");
    expect(catalog.skills()[0]!.skills.find(skill => skill.name === "guide")!.directory).toBe(join(source, "new"));
  });

  it("accepts symlink-installed packages while rejecting supporting files and metadata outside the package", async () => {
    const { base, source, catalog } = setup();
    const root = skill(base, "installed", "guide"); symlinkSync(root, join(source, "guide"), "dir");
    writeFileSync(join(root, "inside.md"), "Inside\n"); symlinkSync(join(root, "inside.md"), join(root, "alias.md"), "file");
    writeFileSync(join(base, "outside.md"), "Outside\n"); symlinkSync(join(base, "outside.md"), join(root, "external.md"), "file");
    const entry = catalog.refresh(signal)[0]!.skills[0]!;
    expect(await catalog.read(entry, "alias.md", signal)).toBe("Inside\n");
    for (const path of ["../outside.md", "external.md"]) await expect(catalog.read(entry, path, signal)).rejects.toMatchObject({ reason: "outside_skill" });
    await expect(catalog.read(entry, join(base, "outside.md"), signal)).rejects.toMatchObject({ reason: "invalid_skill_path" });
    expect(() => packageAsset(root, "external.md")).toThrow("outside the package");
    mkdirSync(join(source, "escape")); symlinkSync(join(root, "SKILL.md"), join(source, "escape", "SKILL.md"), "file");
    expect(catalog.refresh(signal)[0]!.issues).toEqual([{ file: join(source, "escape", "SKILL.md"), message: "The file's symbolic link resolves outside the selected skill package." }]);
  });
});
