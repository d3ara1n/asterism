import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SkillCatalog, parseSkillMetadata } from "./catalog.ts";
import { readToModel } from "../shared/text.ts";
import type { SkillOverview } from "./contract.ts";

const roots: string[] = [];
const signal = new AbortController().signal;
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "asterism-skills-"))); roots.push(base);
  const source = join(base, "skills");
  mkdirSync(source);
  return { base, source, catalog: new SkillCatalog([{ id: source, directory: source }]) };
}
/** The only group in a catalog with a single source. */
const only = (overview: SkillOverview) => overview.sources[0]!;
function skill(source: string, directory: string, name = directory, description = "A useful skill") {
  const root = join(source, directory);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nInstructions\n`);
  return root;
}

describe("skill catalog and reading", () => {
  it("parses multiline and quoted YAML according to the specification, without letting same-name Markdown fields overwrite metadata", () => {
    // Simple line splitting would lose folded descriptions or mistake YAML examples in the body for metadata.
    expect(parseSkillMetadata('\uFEFF---\r\nname: "code-review"\r\ndescription: >-\r\n  Review changes:\r\n  correctness and tests.\r\nmetadata:\r\n  owner: someone\r\n---\r\nname: wrong'))
      .toEqual({ name: "code-review", description: "Review changes: correctness and tests." });
  });

  it("explicitly rejects corrupt frontmatter or missing names/descriptions, without treating body delimiters as a file header", () => {
    // Avoid projecting invalid catalog entries as callable names or accepting nested examples in the body.
    for (const text of [
      "---\nname: a\nname: b\ndescription: test\n---",
      "---\nname: [a]\ndescription: test\n---",
      "---\nname: a\ndescription: ''\n---",
      "Body\n---\nname: a\ndescription: test\n---",
      "---\nname: a\ndescription: test",
    ]) expect(() => parseSkillMetadata(text)).toThrow();
  });

  it("updates the catalog only on explicit refresh, retains the startup catalog for ordinary queries, and isolates local parsing errors from other skills", async () => {
    // Installing or renaming must not implicitly trigger rediscovery through requests, settings reads, or skill_read.
    const { source, catalog } = setup();
    skill(source, "z");
    const a = skill(source, "a");
    const broken = skill(source, "broken");
    writeFileSync(join(broken, "SKILL.md"), "---\nname: missing-description\n---");
    const first = catalog.refresh(signal);
    const prompt = catalog.prompt();
    expect(only(first).skills.map(skill => skill.name)).toEqual(["a", "z"]);
    expect(only(first).issues).toEqual([expect.objectContaining({ file: join(broken, "SKILL.md") })]);
    writeFileSync(join(a, "SKILL.md"), "---\nname: a\ndescription: Updated\n---\nNew instructions");
    rmSync(join(source, "z"), { recursive: true });
    skill(source, "b");
    expect(catalog.overview()).toEqual(first);
    expect(catalog.prompt()).toEqual(prompt);
    await expect(catalog.read({ name: "b", path: "SKILL.md", offset: 1, limit: 10 }, signal))
      .rejects.toMatchObject({ code: "skill_not_found" });
    expect(only(catalog.refresh(signal)).skills).toEqual([
      { name: "a", description: "Updated" }, { name: "b", description: "A useful skill" },
    ]);
    expect(catalog.prompt().text).toContain('{"name":"a","description":"Updated"}');
    // The model accesses skills by name only; catalog hints carry no sources or paths.
    expect(catalog.prompt().text).not.toContain(source);
    expect(prompt.text).toContain('"description":"A useful skill"');
    rmSync(source, { recursive: true });
    expect(only(catalog.overview()).skills.map(skill => skill.name)).toEqual(["a", "b"]);
    expect(catalog.refresh(signal)).toEqual({ sources: [{ source, skills: [], issues: [] }] });
  });

  it("marks all same-name skills as ambiguous and does not arbitrarily choose a directory when reading", async () => {
    // name is the call identity; directory traversal order must not decide which package is read for the same identity.
    const { source, catalog } = setup();
    skill(source, "one", "same");
    skill(source, "two", "same");
    skill(source, "unique");
    const overview = only(catalog.refresh(signal));
    expect(overview.skills.map(skill => skill.name)).toEqual(["unique"]);
    expect(overview.issues.map(issue => issue.file)).toEqual([join(source, "one", "SKILL.md"), join(source, "two", "SKILL.md")]);
    await expect(catalog.read({ name: "same", path: "SKILL.md", offset: 1, limit: 10 }, signal))
      .rejects.toMatchObject({ code: "skill_not_found" });
  });

  it("overrides same-name skills across sources by priority, retaining overridden entries in their original sources and identifying the effective source", async () => {
    // Sources are groups rather than namespaces: model reads by name receive only the package from the higher-priority source, while overridden entries remain visible by source in settings.
    const { base } = setup();
    const plugin = join(base, "plugin"), user = join(base, "user");
    skill(plugin, "shared", "shared", "From plugin");
    skill(plugin, "plugin-only");
    const winner = skill(user, "shared", "shared", "From user");
    const catalog = new SkillCatalog([{ id: "example.plugin", directory: plugin }, { id: user, directory: user }]);
    const overview = catalog.refresh(signal);
    expect(overview.sources).toEqual([
      { source: "example.plugin", issues: [], skills: [
        { name: "plugin-only", description: "A useful skill" },
        { name: "shared", description: "From plugin", overriddenBy: user },
      ] },
      { source: user, issues: [], skills: [{ name: "shared", description: "From user" }] },
    ]);
    expect(catalog.summary()).toEqual({ count: 2, issues: [] });
    expect(catalog.prompt().text).toContain('{"name":"shared","description":"From user"}');
    expect(catalog.prompt().text).not.toContain("From plugin");
    expect((await catalog.read({ name: "shared", path: "SKILL.md", offset: 1, limit: 10 }, signal)).directory).toBe(winner);
  });

  it("paginates package reference files by absolute line number, uses top-level offset in continuation hints, and reads updated text on reread", async () => {
    // skill_read arguments are top-level; directory read hints using target.offset would cause the model to send incorrect continuation arguments.
    const { source, catalog } = setup();
    const root = skill(source, "guide");
    mkdirSync(join(root, "references"));
    const path = "references/checklist.md";
    writeFileSync(join(root, path), "甲\r\n乙\r\n丙\r\n丁\r\n");
    catalog.refresh(signal);
    const read = await catalog.read({ name: "guide", path, offset: 2, limit: 2 }, signal);
    expect(read).toMatchObject({ directory: root, path, totalLines: 4, fromLine: 2, nextOffset: 4,
      rows: [{ line: 2, content: "乙", hash: null }, { line: 3, content: "丙", hash: null }] });
    expect(readToModel(read, "offset")).toContain("Remaining content starts at offset:4.");
    writeFileSync(join(root, path), "已修改\n");
    // Reading reference files looks up only loaded identities; corrupt metadata at this point does not cause reparsing or invalidate the package.
    writeFileSync(join(root, "SKILL.md"), "Edited instructions without frontmatter\n");
    expect((await catalog.read({ name: "guide", path, offset: 1, limit: 10 }, signal)).rows.map(row => row.content)).toEqual(["已修改"]);
  });

  it("allows skill installation through package-root symlinks while requiring file symlinks inside the package to stay within it", async () => {
    // The actual directory of a symlink installation is the boundary; internal links cannot use this entry point to access adjacent packages or arbitrary external files.
    const { base, source, catalog } = setup();
    const root = skill(base, "installed", "guide");
    symlinkSync(root, join(source, "guide"), "dir");
    writeFileSync(join(root, "inside.md"), "Inside\n");
    symlinkSync(join(root, "inside.md"), join(root, "alias.md"), "file");
    writeFileSync(join(base, "outside.md"), "Outside\n");
    symlinkSync(join(base, "outside.md"), join(root, "external.md"), "file");
    symlinkSync(base, join(root, "external"), "dir");
    catalog.refresh(signal);
    const read = (path: string) => catalog.read({ name: "guide", path, offset: 1, limit: 10 }, signal);
    expect((await read("alias.md")).rows.map(row => row.content)).toEqual(["Inside"]);
    for (const path of ["../outside.md", "external.md", "external/outside.md"])
      await expect(read(path)).rejects.toMatchObject({ code: "outside_skill" });
    await expect(read(join(base, "outside.md"))).rejects.toMatchObject({ code: "invalid_skill_path" });
    await expect(read("bad\0path")).rejects.toMatchObject({ code: "invalid_skill_path" });
  });

  it("also checks the symlink boundary of SKILL.md during discovery", async () => {
    // Validating only in skill_read would let catalog scanning read external package content early and inject it into the system prompt.
    const { base, source, catalog } = setup();
    const outside = skill(base, "outside");
    mkdirSync(join(source, "escape"));
    symlinkSync(join(outside, "SKILL.md"), join(source, "escape", "SKILL.md"), "file");
    const overview = only(catalog.refresh(signal));
    expect(overview.skills).toEqual([]);
    expect(overview.issues).toEqual([{
      file: join(source, "escape", "SKILL.md"), message: "The file's symbolic link resolves outside the selected skill package.",
    }]);
  });
});
