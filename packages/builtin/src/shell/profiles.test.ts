import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it } from "vitest";
import { listShellProfiles, resolveShell } from "./profiles.ts";
import type { ShellProfile } from "./contract.ts";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "atelier-profiles-test-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const profile = (id: string, executable: string, env: Record<string, string> = {}): ShellProfile =>
  ({ id, executable, args: [], commandArgs: ["-c"], env });
async function executable(name: string) {
  const path = join(root, name);
  await writeFile(path, "", { mode: 0o755 });
  return path;
}

// 查询必须应用 profile 的 PATH 覆盖；仅把已配置项视为可用会误导终端创建，目录也不是可执行文件。
it("查询按执行环境发现可执行文件，保留不可用配置且不交付环境变量", async () => {
  const name = "atelier-test-shell.exe";
  const path = await executable(name);
  const directory = join(root, "directory");
  await mkdir(directory);
  const settings = {
    selected: "custom",
    profiles: [
      profile("custom", name, { PATH: root, PRIVATE_VALUE: "private-test-value" }),
      profile("missing", join(root, "missing.exe")),
      profile("directory", directory),
    ],
  };
  const result = await listShellProfiles(settings, { PATH: join(root, "empty") });
  expect(result.resolvedProfile).toBe("custom");
  expect(result.profiles.map(({ id, available, resolvedExecutable }) => ({ id, available, resolvedExecutable }))).toEqual([
    { id: "custom", available: true, resolvedExecutable: path },
    { id: "missing", available: false, resolvedExecutable: null },
    { id: "directory", available: false, resolvedExecutable: null },
  ]);
  expect(JSON.stringify(result)).not.toContain("private-test-value");
  expect(result.profiles[0]).not.toHaveProperty("env");
});

// docs/runtime.md：auto 先按平台预设顺序选，再尝试自定义项；配置排列不代表自动选择优先级。
it("自动选择跳过缺失预设，优先可用预设，并与实际执行解析一致", async () => {
  const custom = profile("custom", await executable("custom.exe"));
  const sh = profile("sh", await executable("sh.exe"));
  const settings = { selected: "auto", profiles: [custom, profile("bash", join(root, "missing.exe")), sh] };
  const result = await listShellProfiles(settings, {});
  expect(result.resolvedProfile).toBe("sh");
  expect((await resolveShell(settings, {})).profile.id).toBe("sh");
  const customOnly = { selected: "auto", profiles: [custom, profile("other", sh.executable)] };
  expect((await listShellProfiles(customOnly, {})).resolvedProfile).toBe("custom");
});

// 显式默认项失效时报告不可用；借用其他可用项会使列表宣称的默认 Shell 与 exec 的失败行为矛盾。
it("显式默认项缺失时保持未解析，其他可用配置仍可列出", async () => {
  const settings = { selected: "missing", profiles: [
    profile("missing", join(root, "missing.exe")), profile("other", await executable("other.exe")),
  ] };
  const result = await listShellProfiles(settings, {});
  expect(result.resolvedProfile).toBeNull();
  expect(result.profiles[1]?.available).toBe(true);
  await expect(resolveShell(settings, {})).rejects.toThrow("Shell profile 'missing' has no available executable.");
});
