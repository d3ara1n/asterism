import { inc, prerelease, valid } from "semver";

export type ReleaseMode = "prerelease" | "release";

/** 预发布期间保持目标版本，正式发布后按 Conventional Commits 开启下一轮。 */
export function nextReleaseVersion(latest: string | null, messages: string[], mode: ReleaseMode): string | null {
  if (latest !== null && !valid(latest)) throw new Error(`Invalid release version: ${latest}`);
  let level: "major" | "minor" | "patch" | null = null;
  for (const message of messages) {
    const header = /^([a-z]+)(?:\([^)]+\))?(!)?:/.exec(message);
    if (!header) continue;
    if (header[2] || /^BREAKING[ -]CHANGE:/m.test(message)) level = "major";
    else if (header[1] === "feat" && level !== "major") level = "minor";
    else if (["fix", "perf", "refactor"].includes(header[1]!) && level === null) level = "patch";
  }
  const isPreview = latest !== null && prerelease(latest) !== null;
  if (!level && !(mode === "release" && isPreview)) return null;
  if (latest === null) return mode === "prerelease" ? "0.1.0-beta.1" : "0.1.0";
  if (isPreview) return mode === "prerelease" ? inc(latest, "prerelease", "beta") : inc(latest, "patch");
  const target = inc(latest, level!);
  return mode === "prerelease" ? `${target}-beta.1` : target;
}
