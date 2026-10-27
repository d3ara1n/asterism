import { gt, inc, parse, prerelease, rcompare, valid } from "semver";
import { commitsAfter, hasReleasableChanges, previousRelease, releaseNotes, type PublishedRelease, type ReleaseInput } from "./release-commits.ts";

export interface ReleasePlan {
  version: string;
  prerelease: boolean;
  sourceSha: string;
  notes: string;
}

const versionOf = (release: PublishedRelease) => {
  const version = valid(release.tag);
  if (!version) throw new Error(`Invalid release tag: ${release.tag}`);
  return version;
};
const coreVersion = (version: string) => {
  const parsed = parse(version)!;
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
};

/** Accumulate version impact from the first release tag before a stable release, then from the previous stable release. */
export function planRelease(input: ReleaseInput): ReleasePlan | null {
  const published = [...input.releases].sort((a, b) => rcompare(versionOf(a), versionOf(b)));
  const stable = published.find(release => !release.prerelease && prerelease(versionOf(release)) === null);
  const stableVersion = stable ? versionOf(stable) : null;
  let version: string;
  let notesFrom: string | null;
  let notesCommits;

  if (input.mode === "release") {
    const source = published.find(release => release.tag === input.sourceTag);
    if (!source?.prerelease || source.sha !== input.sourceSha) throw new Error("Select a published prerelease to promote.");
    const parsed = parse(versionOf(source))!;
    if (!parsed.prerelease.length) throw new Error("The selected release has no prerelease version suffix.");
    version = coreVersion(versionOf(source));
    // A stable version exceeds all prereleases for the same target; promoting an old candidate would send newer prerelease users back to old code.
    if (published.some(release => release.prerelease && coreVersion(versionOf(release)) === version && gt(versionOf(release), parsed)))
      throw new Error("Select the newest prerelease for this target version.");
    if (stableVersion && !gt(version, stableVersion)) throw new Error("Promotion must be newer than the latest stable release.");
    notesFrom = stable?.tag ?? null;
    notesCommits = commitsAfter(input.commits, stable?.sha);
  } else {
    if (!hasReleasableChanges(input)) return null;
    let target = "0.1.0";
    // Fix the initial target when no historical tag exists; commits before the first package do not affect subsequent version calculations.
    const baseline = stable ?? published.at(-1);
    if (baseline) {
      const levels = commitsAfter(input.commits, baseline.sha).map(commit => commit.level);
      const level = levels.includes("major") ? "major" : levels.includes("minor") ? "minor" : "patch";
      target = inc(coreVersion(versionOf(baseline)), level)!;
    }
    const existing = published.map(versionOf).filter(value => coreVersion(value) === target && parse(value)!.prerelease[0] === "prerelease");
    version = existing.length ? inc(existing[0]!, "prerelease", "prerelease")! : `${target}-prerelease.1`;
    const highest = published[0];
    if (highest && !gt(version, versionOf(highest))) throw new Error("The calculated prerelease must be newer than published versions. Check commit messages and the release baseline.");
    const previous = previousRelease(input);
    notesFrom = previous?.tag ?? null;
    notesCommits = commitsAfter(input.commits, previous?.sha);
  }
  if (published.some(release => versionOf(release) === version)) throw new Error(`Version ${version} is already published.`);
  return { version, prerelease: input.mode === "prerelease", sourceSha: input.sourceSha,
    notes: releaseNotes(notesCommits, input.repository, notesFrom, `v${version}`) };
}
