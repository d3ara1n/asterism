export type ReleaseMode = "prerelease" | "release";
export type ReleaseLevel = "major" | "minor" | "patch";
type ReleaseSection = "Breaking Changes" | "Features" | "Bug Fixes" | "Refactoring" | "Documentation" | "Maintenance";
export interface ReleaseCommit {
  sha: string;
  subject: string;
  level: ReleaseLevel | null;
  section: ReleaseSection;
}
export interface PublishedRelease {
  tag: string;
  sha: string;
  prerelease: boolean;
  publishedAt: string;
}
export interface ReleaseInput {
  mode: ReleaseMode;
  repository: string;
  sourceSha: string;
  sourceTag: string | null;
  releases: PublishedRelease[];
  /** First-parent chain of the target commit, ordered newest first. */
  commits: ReleaseCommit[];
}

/** One parse yields both version impact and release-note category; maintenance commits may still appear in notes. */
export function parseCommit(sha: string, message: string): ReleaseCommit {
  const subject = message.split(/\r?\n/, 1)[0]!;
  const match = /^([a-z]+)(?:\([^)]+\))?(!)?:\s+\S/.exec(subject);
  const type = match?.[1];
  const breaking = !!match?.[2] || /^BREAKING[ -]CHANGE:\s+\S/m.test(message);
  const level = breaking ? "major" : type === "feat" ? "minor" : type === "fix" || type === "refactor" ? "patch" : null;
  const section = breaking ? "Breaking Changes" : type === "feat" ? "Features" : type === "fix" ? "Bug Fixes"
    : type === "refactor" ? "Refactoring" : type === "docs" ? "Documentation" : "Maintenance";
  return { sha, subject, level, section };
}

/** Matches git log -z --format=%H%x00%B; newlines in the body do not separate records. */
export function parseGitLog(output: string): ReleaseCommit[] {
  const fields = output.split("\0");
  const commits: ReleaseCommit[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2)
    commits.push(parseCommit(fields[index]!, fields[index + 1]!));
  return commits;
}

export function commitsAfter(commits: ReleaseCommit[], sha?: string): ReleaseCommit[] {
  if (!sha) return commits;
  const index = commits.findIndex(commit => commit.sha === sha);
  if (index < 0) throw new Error(`Release baseline ${sha} is not in the source's first-parent history.`);
  return commits.slice(0, index);
}

/** Select the released range by commit position; promoting an older commit does not reintroduce released changes into the next cycle. */
export function previousRelease(input: ReleaseInput): PublishedRelease | undefined {
  const positions = new Map(input.commits.map((commit, index) => [commit.sha, index]));
  return input.releases.filter(release => positions.has(release.sha)).sort((a, b) =>
    positions.get(a.sha)! - positions.get(b.sha)! || b.publishedAt.localeCompare(a.publishedAt))[0];
}

export function hasReleasableChanges(input: ReleaseInput): boolean {
  if (!input.releases.length) return input.commits.length > 0;
  return commitsAfter(input.commits, previousRelease(input)?.sha).some(commit => commit.level !== null);
}

/** The caller supplies the range newest first; commit SHAs identify release-note entries. */
export function releaseNotes(commits: ReleaseCommit[], repository: string, from: string | null, to: string): string {
  const sectionLimit = 20;
  const groups = new Map<ReleaseSection, ReleaseCommit[]>();
  for (const commit of new Map(commits.map(commit => [commit.sha, commit])).values()) {
    const entries = groups.get(commit.section) ?? [];
    entries.push(commit); groups.set(commit.section, entries);
  }
  const base = `https://github.com/${repository}`;
  const lines: string[] = [];
  for (const section of ["Breaking Changes", "Features", "Bug Fixes", "Refactoring", "Documentation", "Maintenance"] as const) {
    const entries = groups.get(section);
    if (!entries) continue;
    lines.push(`## ${section}`, "", ...entries.slice(0, sectionLimit).map(commit =>
      `- ${commit.subject} ([${commit.sha.slice(0, 7)}](${base}/commit/${commit.sha}))`), "");
    const omitted = entries.length - sectionLimit;
    if (omitted > 0)
      lines.push(`… and ${omitted} more ${omitted === 1 ? "commit" : "commits"}. See the Full Changelog below.`, "");
  }
  if (!lines.length) lines.push("No commits in this release range.", "");
  lines.push(`**Full Changelog**: ${from ? `${base}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}` : `${base}/commits/${encodeURIComponent(to)}`}`, "");
  return lines.join("\n");
}
