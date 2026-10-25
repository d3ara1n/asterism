export type ReleaseMode = "prerelease" | "release";
export type ReleaseLevel = "major" | "minor" | "patch";
export interface ReleasePullRequest {
  number: number;
  title: string;
  url: string;
  author: string;
  mergeCommit: string;
}
export interface PublishedRelease {
  tag: string;
  sha: string;
  prerelease: boolean;
  publishedAt: string;
  pullRequests: number[];
}
export interface ReleaseInput {
  mode: ReleaseMode;
  repository: string;
  sourceSha: string;
  sourceTag: string | null;
  releases: PublishedRelease[];
  pullRequests: ReleasePullRequest[];
  previousTag: string | null;
  newPullRequests: number[];
}

/** PR 标题是版本影响与说明分类的唯一来源，普通提交不另计一次。 */
export function pullRequestLevel(title: string): ReleaseLevel | null {
  const match = /^([a-z]+)(?:\([^)]+\))?(!)?:\s+\S/.exec(title);
  if (!match) return null;
  if (match[2]) return "major";
  if (match[1] === "feat") return "minor";
  if (match[1] === "fix" || match[1] === "refactor") return "patch";
  return null;
}

export function pullRequestsInHistory(pullRequests: ReleasePullRequest[], commits: Iterable<string>): ReleasePullRequest[] {
  const history = new Set(commits);
  return [...new Map(pullRequests.filter(pr => history.has(pr.mergeCommit)).map(pr => [pr.number, pr])).values()]
    .sort((a, b) => a.number - b.number);
}

export function hasReleasableChanges(input: ReleaseInput): boolean {
  const fresh = new Set(input.newPullRequests);
  return input.pullRequests.some(pr => fresh.has(pr.number) && pullRequestLevel(pr.title) !== null);
}

/** 说明按 PR 去重；正式版调用方传入自上个正式版起的累计范围。 */
export function releaseNotes(prs: ReleasePullRequest[], repository: string, from: string | null, to: string): string {
  const groups = new Map<string, ReleasePullRequest[]>();
  for (const pr of [...new Map(prs.map(pr => [pr.number, pr])).values()].sort((a, b) => a.number - b.number)) {
    const type = /^([a-z]+)(?:\([^)]+\))?(!)?:/.exec(pr.title);
    const section = type?.[2] ? "Breaking Changes" : type?.[1] === "feat" ? "Features"
      : type?.[1] === "fix" ? "Bug Fixes" : type?.[1] === "refactor" ? "Refactoring"
      : type?.[1] === "docs" ? "Documentation" : "Maintenance";
    const entries = groups.get(section) ?? [];
    entries.push(pr); groups.set(section, entries);
  }
  const lines: string[] = [];
  for (const section of ["Breaking Changes", "Features", "Bug Fixes", "Refactoring", "Documentation", "Maintenance"]) {
    const entries = groups.get(section);
    if (!entries) continue;
    lines.push(`## ${section}`, "", ...entries.map(pr => `- ${pr.title.replace(/[\r\n]/g, " ")} ([#${pr.number}](${pr.url}))${pr.author ? ` — @${pr.author}` : ""}`), "");
  }
  if (!lines.length) lines.push("No pull requests in this release range.", "");
  const base = `https://github.com/${repository}`;
  lines.push(`**Full Changelog**: ${from ? `${base}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}` : `${base}/commits/${encodeURIComponent(to)}`}`, "");
  return lines.join("\n");
}
