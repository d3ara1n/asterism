import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SkillCatalog, parseSkillMetadata } from "./catalog.ts";
import { readToModel } from "../shared/text.ts";

const roots: string[] = [];
const signal = new AbortController().signal;
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "atelier-skills-"))); roots.push(base);
  const source = join(base, "skills");
  mkdirSync(source);
  return { base, source, catalog: new SkillCatalog(source) };
}
function skill(source: string, directory: string, name = directory, description = "A useful skill") {
  const root = join(source, directory);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nInstructions\n`);
  return root;
}

describe("技能目录与读取", () => {
  it("YAML 多行和引号按规范解析，Markdown 中的同名字段不覆盖元数据", () => {
    // 简单逐行拆分会丢掉折叠描述，或把正文中的 YAML 示例误当元数据。
    expect(parseSkillMetadata('\uFEFF---\r\nname: "code-review"\r\ndescription: >-\r\n  Review changes:\r\n  correctness and tests.\r\nmetadata:\r\n  owner: someone\r\n---\r\nname: wrong'))
      .toEqual({ name: "code-review", description: "Review changes: correctness and tests." });
  });

  it("损坏或缺少名称描述的 frontmatter 明确失败，正文内的分隔符不能冒充文件头", () => {
    // 避免把坏目录条目投影为可调用名称，或接受正文里的嵌套示例。
    for (const text of [
      "---\nname: a\nname: b\ndescription: test\n---",
      "---\nname: [a]\ndescription: test\n---",
      "---\nname: a\ndescription: ''\n---",
      "Body\n---\nname: a\ndescription: test\n---",
      "---\nname: a\ndescription: test",
    ]) expect(() => parseSkillMetadata(text)).toThrow();
  });

  it("目录仅在显式刷新时更新，普通查询保留启动目录，局部解析错误不影响其他技能", async () => {
    // 安装或改名不能通过请求、设置读取和 skill_read 隐式触发重新发现。
    const { source, catalog } = setup();
    skill(source, "z");
    const a = skill(source, "a");
    const broken = skill(source, "broken");
    writeFileSync(join(broken, "SKILL.md"), "---\nname: missing-description\n---");
    const first = catalog.refresh(signal);
    const prompt = catalog.prompt();
    expect(first.skills.map(skill => skill.name)).toEqual(["a", "z"]);
    expect(first.issues).toEqual([expect.objectContaining({ file: join(broken, "SKILL.md") })]);
    writeFileSync(join(a, "SKILL.md"), "---\nname: a\ndescription: Updated\n---\nNew instructions");
    rmSync(join(source, "z"), { recursive: true });
    skill(source, "b");
    expect(catalog.overview()).toEqual(first);
    expect(catalog.prompt()).toEqual(prompt);
    await expect(catalog.read({ name: "b", path: "SKILL.md", offset: 1, limit: 10 }, signal))
      .rejects.toMatchObject({ code: "skill_not_found" });
    expect(catalog.refresh(signal).skills).toEqual([
      { name: "a", description: "Updated" }, { name: "b", description: "A useful skill" },
    ]);
    expect(catalog.prompt().text).toContain('"description":"Updated"');
    expect(prompt.text).toContain('"description":"A useful skill"');
    rmSync(source, { recursive: true });
    expect(catalog.overview().skills.map(skill => skill.name)).toEqual(["a", "b"]);
    expect(catalog.refresh(signal)).toEqual({ source, skills: [], issues: [] });
  });

  it("同名技能全部标为歧义，读取不会任意选中某个目录", async () => {
    // name 是调用身份；目录遍历顺序不能决定相同身份读取哪个包。
    const { source, catalog } = setup();
    skill(source, "one", "same");
    skill(source, "two", "same");
    skill(source, "unique");
    const overview = catalog.refresh(signal);
    expect(overview.skills.map(skill => skill.name)).toEqual(["unique"]);
    expect(overview.issues.map(issue => issue.file)).toEqual([join(source, "one", "SKILL.md"), join(source, "two", "SKILL.md")]);
    await expect(catalog.read({ name: "same", path: "SKILL.md", offset: 1, limit: 10 }, signal))
      .rejects.toMatchObject({ code: "skill_not_found" });
  });

  it("包内参考文件按绝对行号分页，续读提示使用顶层 offset 参数，重新读取取得新正文", async () => {
    // skill_read 参数位于顶层；目录 read 的 target.offset 提示会导致模型续读参数错误。
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
    // 读取参考文件只查已加载身份；元数据此时损坏也不重新解析或使该包失效。
    writeFileSync(join(root, "SKILL.md"), "Edited instructions without frontmatter\n");
    expect((await catalog.read({ name: "guide", path, offset: 1, limit: 10 }, signal)).rows.map(row => row.content)).toEqual(["已修改"]);
  });

  it("包根符号链接可安装技能，包内文件链接仍须留在该包内", async () => {
    // 链接安装的真实目录是边界；内部链接不能借该入口访问相邻包或任意外部文件。
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

  it("发现阶段同样检查 SKILL.md 的符号链接范围", async () => {
    // 只在 skill_read 校验会使目录扫描提前读到包外内容并注入系统提示。
    const { base, source, catalog } = setup();
    const outside = skill(base, "outside");
    mkdirSync(join(source, "escape"));
    symlinkSync(join(outside, "SKILL.md"), join(source, "escape", "SKILL.md"), "file");
    const overview = catalog.refresh(signal);
    expect(overview.skills).toEqual([]);
    expect(overview.issues).toEqual([{
      file: join(source, "escape", "SKILL.md"), message: "The file's symbolic link resolves outside the selected skill package.",
    }]);
  });
});
