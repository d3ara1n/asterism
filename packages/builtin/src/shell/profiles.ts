import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import type { ShellProfile, ShellSettings } from "./contract.ts";

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

export async function resolveShell(settings: ShellSettings, inherited: NodeJS.ProcessEnv = process.env): Promise<ResolvedShell> {
  const order = process.platform === "win32" ? ["pwsh", "nu", "fish", "bash", "zsh", "sh"]
    : process.platform === "darwin" ? ["zsh", "bash", "pwsh", "fish", "nu", "sh"]
      : ["bash", "zsh", "pwsh", "fish", "nu", "sh"];
  const profiles = settings.selected === "auto"
    ? [...order.flatMap(id => settings.profiles.filter(profile => profile.id === id)),
      ...settings.profiles.filter(profile => !order.includes(profile.id))]
    : settings.profiles.filter(profile => profile.id === settings.selected);
  for (const profile of profiles) {
    const env = environment(profile.env, inherited);
    const executable = await executablePath(profile.executable, env);
    if (executable) return { profile, executable, env };
  }
  throw new Error(settings.selected === "auto"
    ? "No configured shell executable was found. Configure a shell profile in Builtin settings."
    : `Shell profile '${settings.selected}' has no available executable. Configure its executable in Builtin settings.`);
}
