import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { planRelease } from "./release-version.ts";
import type { ReleaseInput } from "./release-commits.ts";

const inputFile = process.argv[2] ?? ".local/release/input.json";
const notesFile = process.argv[3] ?? ".local/release/notes.md";
const input = JSON.parse(readFileSync(inputFile, "utf8")) as ReleaseInput;
const plan = planRelease(input);
if (!plan) throw new Error("No releasable changes; the preflight job should have skipped this build.");
writeFileSync(notesFile, plan.notes);
const output = `version=${plan.version}\nprerelease=${plan.prerelease}\nsource_sha=${plan.sourceSha}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
console.log(`Next release: v${plan.version} from ${plan.sourceSha}`);
