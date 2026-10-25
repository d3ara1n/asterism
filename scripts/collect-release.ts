import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { hasReleasableChanges, pullRequestsInHistory, type PublishedRelease, type ReleaseInput, type ReleasePullRequest } from "./release-prs.ts";

// 只用 Node 内置模块与 gh；无新 PR 的每周检查在 npm ci 前结束。
const [mode = "prerelease", sourceTag = "", outputFile = ".local/release/input.json"] = process.argv.slice(2);
if (mode !== "prerelease" && mode !== "release") throw new Error("Expected prerelease or release.");
const repository = process.env.GITHUB_REPOSITORY ?? "d3ara1n/atelier";
const [owner, name] = repository.split("/");
if (!owner || !name) throw new Error("GITHUB_REPOSITORY must identify a repository.");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const gh = (...args: string[]) => JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
const releasePages = gh("api", `repos/${repository}/releases?per_page=100`, "--paginate", "--slurp") as
  { tag_name: string; draft: boolean; prerelease: boolean; published_at: string }[][];
const releases = releasePages.flat().filter(release => !release.draft && /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(release.tag_name));
const sourceRelease = mode === "release" ? releases.find(release => release.tag_name === sourceTag && release.prerelease) : null;
if (mode === "release" && !sourceRelease) throw new Error("Select an existing published prerelease tag.");
const sourceSha = git("rev-parse", "--verify", sourceRelease ? `refs/tags/${sourceRelease.tag_name}^{commit}` : "HEAD");
git("merge-base", "--is-ancestor", sourceSha, "HEAD");
const query = `query($owner: String!, $name: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $endCursor, states: MERGED, baseRefName: "main", orderBy: {field: CREATED_AT, direction: ASC}) {
      nodes { number title url author { login } mergeCommit { oid } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
const prPages = gh("api", "graphql", "--paginate", "--slurp", "-f", `query=${query}`, "-f", `owner=${owner}`, "-f", `name=${name}`) as
  { data: { repository: { pullRequests: { nodes: { number: number; title: string; url: string; author: { login: string } | null; mergeCommit: { oid: string } | null }[] } } } }[];
const allPrs: ReleasePullRequest[] = prPages.flatMap(page => page.data.repository.pullRequests.nodes).flatMap(pr =>
  pr.mergeCommit ? [{ number: pr.number, title: pr.title, url: pr.url, author: pr.author?.login ?? "", mergeCommit: pr.mergeCommit.oid }] : []);
const historyCache = new Map<string, string[]>();
const history = (sha: string): string[] => {
  let entries = historyCache.get(sha);
  if (!entries) { entries = git("rev-list", "--first-parent", sha).split("\n"); historyCache.set(sha, entries); }
  return entries;
};
const mainHistory = new Set(history(git("rev-parse", "HEAD")));
const published: PublishedRelease[] = releases.flatMap(release => {
  const sha = git("rev-parse", "--verify", `refs/tags/${release.tag_name}^{commit}`);
  if (!mainHistory.has(sha)) return [];
  return [{ tag: release.tag_name, sha, prerelease: release.prerelease, publishedAt: release.published_at,
    pullRequests: pullRequestsInHistory(allPrs, history(sha)).map(pr => pr.number) }];
});
const targetHistory = history(sourceSha);
const positions = new Map(targetHistory.map((sha, index) => [sha, index]));
// 选提交历史中最近的已发布位置；较旧提交的后来晋级不会让已发布 PR 再次触发。
const previous = published.filter(release => positions.has(release.sha)).sort((a, b) =>
  positions.get(a.sha)! - positions.get(b.sha)! || b.publishedAt.localeCompare(a.publishedAt))[0];
const pullRequests = pullRequestsInHistory(allPrs, targetHistory);
const alreadyPublished = new Set(previous?.pullRequests ?? []);
const input: ReleaseInput = {
  mode, repository, sourceSha, sourceTag: sourceRelease?.tag_name ?? null, releases: published, pullRequests,
  previousTag: previous?.tag ?? null,
  newPullRequests: pullRequests.filter(pr => !alreadyPublished.has(pr.number)).map(pr => pr.number),
};
const skip = mode === "prerelease" && !hasReleasableChanges(input);
mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(input, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `skip=${skip}\nsource_sha=${sourceSha}\n`);
console.log(skip ? "No new releasable pull requests; skipping installation and builds." : `Preparing ${mode} from ${sourceSha}.`);
