import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { hasReleasableChanges, parseGitLog, type PublishedRelease, type ReleaseInput } from "./release-commits.ts";
import type { PackageInput } from "./release-packages.ts";
import { publicPackages, registryPublished } from "./release-registry.ts";

// Uses only Node built-ins, gh, and the public npm registry; the check for new qualifying commits finishes before npm ci.
const [mode = "prerelease", sourceTag = "", outputFile = ".local/release/input.json"] = process.argv.slice(2);
if (mode !== "prerelease" && mode !== "release") throw new Error("Expected prerelease or release.");
const repository = process.env.GITHUB_REPOSITORY ?? "d3ara1n/asterism";
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
const gh = (...args: string[]) => JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
const releasePages = gh("api", `repos/${repository}/releases?per_page=100`, "--paginate", "--slurp") as
  { tag_name: string; draft: boolean; prerelease: boolean; published_at: string }[][];
const releases = releasePages.flat().filter(release => !release.draft && /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(release.tag_name));
const sourceRelease = mode === "release" ? releases.find(release => release.tag_name === sourceTag && release.prerelease) : null;
if (mode === "release" && !sourceRelease) throw new Error("Select an existing published prerelease tag.");
const sourceSha = git("rev-parse", "--verify", sourceRelease ? `refs/tags/${sourceRelease.tag_name}^{commit}` : "HEAD");
const mainHistory = new Set(git("rev-list", "--first-parent", "HEAD").split("\n"));
if (!mainHistory.has(sourceSha)) throw new Error("The release source must belong to main's first-parent history.");
const published: PublishedRelease[] = releases.flatMap(release => {
  const sha = git("rev-parse", "--verify", `refs/tags/${release.tag_name}^{commit}`);
  if (!mainHistory.has(sha)) return [];
  return [{ tag: release.tag_name, sha, prerelease: release.prerelease, publishedAt: release.published_at }];
});
const packages: PackageInput[] = await Promise.all(publicPackages.map(async directory => {
  const { name } = JSON.parse(git("show", `${sourceSha}:${directory}/package.json`)) as { name: string };
  const touched = git("log", "--first-parent", "--format=%H", sourceSha, "--", directory).split("\n").filter(Boolean);
  return { directory, name, published: await registryPublished(name), touched };
}));
const input: ReleaseInput & { packages: PackageInput[] } = {
  mode, repository, sourceSha, sourceTag: sourceRelease?.tag_name ?? null, releases: published,
  commits: parseGitLog(git("log", "--first-parent", "-z", "--format=%H%x00%B", sourceSha)), packages,
};
const skip = mode === "prerelease" && !hasReleasableChanges(input);
mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(input, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `skip=${skip}\nsource_sha=${sourceSha}\n`);
console.log(skip ? "No new releasable commits; skipping installation and builds." : `Preparing ${mode} from ${sourceSha}.`);
