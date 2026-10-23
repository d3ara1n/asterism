import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import type { ShellProfile, ShellProfileList, ShellSettings } from "./contract.ts";

export interface ResolvedShell { profile: ShellProfile; executable: string; env: NodeJS.ProcessEnv }

function environment(overrides: Record<string, string>, inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...inherited };
  for (const [key, value] of Object.entries(overrides)) {
    const existing = process.platform === "win32" ? Object.keys(env).find(name => name.toLowerCase() === key.toLowerCase()) : key;
    env[existing ?? key] = value;
  }
  return env;
}

async function executablePath(executable: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const expanded = executable.startsWith("~/") || executable.startsWith("~\\") ? join(homedir(), executable.slice(2)) : executable;
  const windows = process.platform === "win32";
  const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
  const extras = windows
    ? [env.ProgramFiles && join(env.ProgramFiles, "PowerShell", "7"), env.ProgramFiles && join(env.ProgramFiles, "Git", "bin")]
    : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", join(homedir(), ".local", "bin"), join(homedir(), ".cargo", "bin")];
  const directories = [...pathValue.split(delimiter), ...extras].filter((value): value is string => Boolean(value));
  const names = windows && !expanded.toLowerCase().endsWith(".exe") ? [expanded, `${expanded}.exe`] : [expanded];
  const candidates = isAbsolute(expanded) ? names : directories.flatMap(directory => names.map(name => join(directory, name)));
  for (const candidate of candidates) {
    try {
      await access(candidate, windows ? constants.F_OK : constants.X_OK);
      if ((await stat(candidate)).isFile()) return resolve(candidate);
    } catch { /* 继续查找下一个实际存在的可执行文件。 */ }
  }
  return null;
}

function orderedProfiles(settings: ShellSettings): ShellProfile[] {
  const order = process.platform === "win32" ? ["pwsh", "nu", "fish", "bash", "zsh", "sh"]
    : process.platform === "darwin" ? ["zsh", "bash", "pwsh", "fish", "nu", "sh"]
      : ["bash", "zsh", "pwsh", "fish", "nu", "sh"];
  return settings.selected === "auto"
    ? [...order.flatMap(id => settings.profiles.filter(profile => profile.id === id)),
      ...settings.profiles.filter(profile => !order.includes(profile.id))]
    : settings.profiles.filter(profile => profile.id === settings.selected);
}

async function resolveProfile(profile: ShellProfile, inherited: NodeJS.ProcessEnv): Promise<ResolvedShell | null> {
  const env = environment(profile.env, inherited);
  const executable = await executablePath(profile.executable, env);
  return executable ? { profile, executable, env } : null;
}

/** 查询与执行共用解析规则；模型结果只投影配置元数据与发现结果。 */
export async function listShellProfiles(settings: ShellSettings, inherited: NodeJS.ProcessEnv = process.env): Promise<ShellProfileList> {
  const profiles = await Promise.all(settings.profiles.map(async profile => {
    const resolved = await resolveProfile(profile, inherited);
    return {
      id: profile.id, executable: profile.executable,
      args: [...profile.args], commandArgs: [...profile.commandArgs],
      available: resolved !== null, resolvedExecutable: resolved?.executable ?? null,
    };
  }));
  const available = new Set(profiles.filter(profile => profile.available).map(profile => profile.id));
  const resolvedProfile = orderedProfiles(settings).find(profile => available.has(profile.id))?.id ?? null;
  return { selected: settings.selected, resolvedProfile, profiles };
}

export async function resolveShell(settings: ShellSettings, inherited: NodeJS.ProcessEnv = process.env): Promise<ResolvedShell> {
  for (const profile of orderedProfiles(settings)) {
    const resolved = await resolveProfile(profile, inherited);
    if (resolved) return resolved;
  }
  throw new Error(settings.selected === "auto"
    ? "No configured shell executable was found. Configure a shell profile in Builtin settings."
    : `Shell profile '${settings.selected}' has no available executable. Configure its executable in Builtin settings.`);
}
