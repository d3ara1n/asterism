import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { rcompare, valid } from "semver";
import { nextReleaseVersion, type ReleaseMode } from "./release-version.ts";

const mode = process.argv[2] ?? "prerelease";
if (mode !== "prerelease" && mode !== "release") throw new Error("Expected prerelease or release.");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tags = git("tag", "--merged", "HEAD", "--list", "v*").split("\n")
  .filter(tag => valid(tag.slice(1))).sort((a, b) => rcompare(a.slice(1), b.slice(1)));
const latest = tags[0] ?? null;
const messages = git("log", "--format=%B%x00", latest ? `${latest}..HEAD` : "HEAD").split("\0");
const version = nextReleaseVersion(latest?.slice(1) ?? null, messages.map(message => message.trim()), mode as ReleaseMode);
const output = `version=${version ?? ""}\nskip=${version === null}\nprerelease=${mode === "prerelease"}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
console.log(version ? `Next release: v${version}` : "No releasable changes.");
