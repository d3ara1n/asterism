import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it } from "vitest";
import { listShellProfiles, resolveShell } from "./profiles.ts";
import type { ShellProfile } from "./contract.ts";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "asterism-profiles-test-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const profile = (id: string, executable: string, env: Record<string, string> = {}): ShellProfile =>
  ({ id, executable, args: [], commandArgs: ["-c"], env });
async function executable(name: string) {
  const path = join(root, name);
  await writeFile(path, "", { mode: 0o755 });
  return path;
}

// Queries must apply the profile's PATH override; treating configured entries alone as available would mislead terminal creation, and directories are not executables.
it("discovers executables using the execution environment, retains unavailable configurations, and exposes no environment variables", async () => {
  const name = "asterism-test-shell.exe";
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

// auto first follows platform preset order, then tries custom entries; configuration order is not automatic-selection priority.
it("automatic selection skips missing presets, prioritizes available presets, and matches actual execution resolution", async () => {
  const custom = profile("custom", await executable("custom.exe"));
  const sh = profile("sh", await executable("sh.exe"));
  const settings = { selected: "auto", profiles: [custom, profile("bash", join(root, "missing.exe")), sh] };
  const result = await listShellProfiles(settings, {});
  expect(result.resolvedProfile).toBe("sh");
  expect((await resolveShell(settings, {})).profile.id).toBe("sh");
  const customOnly = { selected: "auto", profiles: [custom, profile("other", sh.executable)] };
  expect((await listShellProfiles(customOnly, {})).resolvedProfile).toBe("custom");
});

// An invalid explicit default is reported as unavailable; borrowing another available entry would contradict exec failure behavior with the listed default Shell.
it("leaves a missing explicit default unresolved while still listing other available configurations", async () => {
  const settings = { selected: "missing", profiles: [
    profile("missing", join(root, "missing.exe")), profile("other", await executable("other.exe")),
  ] };
  const result = await listShellProfiles(settings, {});
  expect(result.resolvedProfile).toBeNull();
  expect(result.profiles[1]?.available).toBe(true);
  await expect(resolveShell(settings, {})).rejects.toThrow("Shell profile 'missing' has no available executable.");
});
