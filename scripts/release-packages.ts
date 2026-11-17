import { inc, prerelease, valid } from "semver";
import type { ReleaseCommit, ReleaseLevel, ReleaseMode } from "./release-commits.ts";

export interface PackageInput {
  directory: string;
  name: string;
  /** Registry versions mapped to the source commit npm recorded for each publication. */
  published: Record<string, string | null>;
  /** SHAs on the source's first-parent history whose first-parent diff touches the directory. */
  touched: string[];
  /** Complete shipped example manifests and the managed public packages in their devDependencies. */
  examples?: Array<{ path: string; dependencies: string[] }>;
}
export interface PackagePlan {
  directory: string;
  name: string;
  version: string;
  publish: boolean;
  /** Example manifests whose dependency pins the release writer stamps with planned versions. */
  examples?: string[];
}

/** Nearest stable publication on this first-parent history, optionally at or before an older source. */
function publicationAt(input: PackageInput, positions: Map<string, number>, at = 0) {
  let baseline: { version: string; position: number } | undefined;
  for (const [version, sha] of Object.entries(input.published)) {
    const position = sha ? positions.get(sha) : undefined;
    if (valid(version) && prerelease(version) === null && position !== undefined && position >= at
      && (!baseline || position < baseline.position)) baseline = { version, position };
  }
  return baseline;
}

function nextVersion(input: PackageInput, baseVersion: string, level: ReleaseLevel): string {
  const version = inc(baseVersion, level)!;
  if (version in input.published) throw new Error(`${input.name}@${version} is already published from another commit.`);
  return version;
}

/**
 * Package versions advance independently from the nearest publication on the source history,
 * using the same commit-level rules as the application. Channels are distinguished by dist-tags.
 */
export function planPackage(input: PackageInput, commits: ReleaseCommit[], mode: ReleaseMode): PackagePlan {
  const positions = new Map(commits.map((commit, index) => [commit.sha, index]));
  const baseline = publicationAt(input, positions);
  if (!baseline) throw new Error(`${input.name} has no publication on the source history; publish an initial version manually.`);
  const { version: baseVersion, position } = baseline;
  const touched = new Set(input.touched);
  const levels = commits.slice(0, position).filter(commit => touched.has(commit.sha)).map(commit => commit.level);
  const plan = { directory: input.directory, name: input.name,
    ...(input.examples ? { examples: input.examples.map(example => example.path) } : {}) };
  if (!levels.some(level => level !== null)) return { ...plan, version: baseVersion, publish: false };
  if (mode === "release") throw new Error(`${input.name} has changes that its prerelease did not publish.`);
  const level = levels.includes("major") ? "major" : levels.includes("minor") ? "minor" : "patch";
  return { ...plan, version: nextVersion(input, baseVersion, level), publish: true };
}

/**
 * Inputs follow catalog dependency order (apart from self-pins). Direct plans remain independent;
 * generated example changes add a patch only when the owner does not already need publication.
 */
export function planPackages(inputs: PackageInput[], commits: ReleaseCommit[], mode: ReleaseMode): PackagePlan[] {
  const positions = new Map(commits.map((commit, index) => [commit.sha, index]));
  const catalogue = new Map(inputs.map((input, index) => [input.name, index]));
  for (const [index, input] of inputs.entries()) for (const name of new Set(input.examples?.flatMap(example => example.dependencies))) {
    if (name !== input.name && (catalogue.get(name) ?? Infinity) >= index)
      throw new Error(`Example dependency ${name} must precede ${input.name} in the release catalogue.`);
  }
  const plans = new Map(inputs.map(input => [input.name, planPackage(input, commits, mode)]));
  const packages = new Map(inputs.map(input => [input.name, input]));
  for (const input of inputs) {
    const plan = plans.get(input.name)!;
    if (plan.publish) continue;
    const baseline = publicationAt(input, positions)!; // The direct planner requires this baseline.
    const dependencies = new Set(input.examples?.flatMap(example => example.dependencies));
    for (const name of dependencies) {
      // A stamped self-pin equals the owner's release version, not its previous source pin.
      if (name === input.name) continue;
      const dependency = packages.get(name);
      if (!dependency) throw new Error(`${input.name} example dependency ${name} is not a managed public package.`);
      const paired = publicationAt(dependency, positions, baseline.position);
      // A newly introduced public package has no older pairing; establishing one also changes the example.
      // Compare versions, not publish flags: an upstream package may already be published from this candidate.
      if (paired?.version === plans.get(name)!.version) continue;
      if (mode === "release") throw new Error(`${input.name} has changes that its prerelease did not publish.`);
      plans.set(input.name, { ...plan, version: nextVersion(input, baseline.version, "patch"), publish: true });
      break;
    }
  }
  return inputs.map(input => plans.get(input.name)!);
}

export function packageNotes(plans: PackagePlan[], channel: string): string {
  return ["## Plugin packages", "", `Plugin development packages for this version, available under the npm \`${channel}\` tag:`, "",
    ...plans.map(plan => `- \`${plan.name}@${plan.version}\``), ""].join("\n");
}
