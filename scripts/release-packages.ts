import { inc, prerelease, valid } from "semver";
import type { ReleaseCommit, ReleaseMode } from "./release-commits.ts";

export interface PackageInput {
  directory: string;
  name: string;
  /** Registry versions mapped to the source commit npm recorded for each publication. */
  published: Record<string, string | null>;
  /** SHAs on the source's first-parent history whose first-parent diff touches the directory. */
  touched: string[];
}
export interface PackagePlan {
  directory: string;
  name: string;
  version: string;
  publish: boolean;
}

/**
 * Package versions advance independently from the nearest publication on the source history,
 * using the same commit-level rules as the application. Channels are distinguished by dist-tags.
 */
export function planPackage(input: PackageInput, commits: ReleaseCommit[], mode: ReleaseMode): PackagePlan {
  const positions = new Map(commits.map((commit, index) => [commit.sha, index]));
  const baseline = Object.entries(input.published)
    .filter(([version, sha]) => valid(version) && prerelease(version) === null && sha && positions.has(sha))
    .sort(([, a], [, b]) => positions.get(a!)! - positions.get(b!)!)[0];
  if (!baseline) throw new Error(`${input.name} has no publication on the source history; publish an initial version manually.`);
  const [baseVersion, baseSha] = baseline;
  const touched = new Set(input.touched);
  const levels = commits.slice(0, positions.get(baseSha!)).filter(commit => touched.has(commit.sha)).map(commit => commit.level);
  const plan = { directory: input.directory, name: input.name };
  if (!levels.some(level => level !== null)) return { ...plan, version: baseVersion, publish: false };
  if (mode === "release") throw new Error(`${input.name} has changes that its prerelease did not publish.`);
  const level = levels.includes("major") ? "major" : levels.includes("minor") ? "minor" : "patch";
  const version = inc(baseVersion, level)!;
  if (version in input.published) throw new Error(`${input.name}@${version} is already published from another commit.`);
  return { ...plan, version, publish: true };
}

export function packageNotes(plans: PackagePlan[], channel: string): string {
  return ["## Plugin packages", "", `Plugin development packages for this version, available under the npm \`${channel}\` tag:`, "",
    ...plans.map(plan => `- \`${plan.name}@${plan.version}\``), ""].join("\n");
}
