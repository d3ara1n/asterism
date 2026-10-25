import { gt, inc, parse, prerelease, rcompare, valid } from "semver";
import { hasReleasableChanges, pullRequestLevel, releaseNotes, type PublishedRelease, type ReleaseInput } from "./release-prs.ts";

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

/** 目标版本相对上一个正式版计算，同一目标只增长预发布序号。 */
export function planRelease(input: ReleaseInput): ReleasePlan | null {
  const published = [...input.releases].sort((a, b) => rcompare(versionOf(a), versionOf(b)));
  const stable = published.find(release => !release.prerelease && prerelease(versionOf(release)) === null);
  const stableVersion = stable ? versionOf(stable) : null;
  const included = new Set(stable?.pullRequests ?? []);
  const accumulated = input.pullRequests.filter(pr => !included.has(pr.number));
  let version: string;
  let notesFrom: string | null;
  let notesPrs = accumulated;

  if (input.mode === "release") {
    const source = published.find(release => release.tag === input.sourceTag);
    if (!source?.prerelease || source.sha !== input.sourceSha) throw new Error("Select a published prerelease to promote.");
    const parsed = parse(versionOf(source))!;
    if (!parsed.prerelease.length) throw new Error("The selected release has no prerelease version suffix.");
    version = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    // 正式号高于同目标的所有预发布；晋级旧候选会让较新预发布的用户装回旧代码。
    if (published.some(release => {
      const other = parse(versionOf(release))!;
      return release.prerelease && `${other.major}.${other.minor}.${other.patch}` === version && gt(other, parsed);
    })) throw new Error("Select the newest prerelease for this target version.");
    if (stableVersion && !gt(version, stableVersion)) throw new Error("Promotion must be newer than the latest stable release.");
    notesFrom = stable?.tag ?? null;
  } else {
    if (!hasReleasableChanges(input)) return null;
    const levels = accumulated.map(pr => pullRequestLevel(pr.title));
    const level = levels.includes("major") ? "major" : levels.includes("minor") ? "minor" : "patch";
    const target = inc(stableVersion ?? "0.0.0", level)!;
    const existing = published.map(versionOf).filter(value => {
      const parsed = parse(value)!;
      return `${parsed.major}.${parsed.minor}.${parsed.patch}` === target && parsed.prerelease[0] === "prerelease";
    });
    version = existing.length ? inc(existing[0]!, "prerelease", "prerelease")! : `${target}-prerelease.1`;
    const highest = published[0];
    if (highest && !gt(version, versionOf(highest))) throw new Error("The calculated prerelease must be newer than published versions. Check PR titles and the release baseline.");
    notesFrom = input.previousTag;
    const fresh = new Set(input.newPullRequests);
    notesPrs = input.pullRequests.filter(pr => fresh.has(pr.number));
  }
  if (published.some(release => versionOf(release) === version)) throw new Error(`Version ${version} is already published.`);
  return { version, prerelease: input.mode === "prerelease", sourceSha: input.sourceSha,
    notes: releaseNotes(notesPrs, input.repository, notesFrom, `v${version}`) };
}
