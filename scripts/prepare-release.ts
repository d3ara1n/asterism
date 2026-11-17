import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { planRelease } from "./release-version.ts";
import { packageNotes, planPackages, type PackageInput } from "./release-packages.ts";
import type { ReleaseInput } from "./release-commits.ts";

const inputFile = process.argv[2] ?? ".local/release/input.json";
const notesFile = process.argv[3] ?? ".local/release/notes.md";
const input = JSON.parse(readFileSync(inputFile, "utf8")) as ReleaseInput & { packages: PackageInput[] };
const plan = planRelease(input);
if (!plan) throw new Error("No releasable changes; the preflight job should have skipped this build.");
const packages = planPackages(input.packages, input.commits, input.mode);
mkdirSync(dirname(notesFile), { recursive: true });
writeFileSync(notesFile, `${plan.notes}\n${packageNotes(packages, plan.prerelease ? "next" : "latest")}`);
const output = `version=${plan.version}\nprerelease=${plan.prerelease}\nsource_sha=${plan.sourceSha}\npackages=${JSON.stringify(packages)}\npublish_packages=${packages.some(plan => plan.publish)}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
console.log(`Next release: v${plan.version} from ${plan.sourceSha}`);
for (const item of packages) console.log(`${item.name}@${item.version}${item.publish ? " (publish)" : ""}`);
