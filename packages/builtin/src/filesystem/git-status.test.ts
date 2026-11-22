import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { git, GitExit } from "./git.ts";
import { discoverGitWorktree } from "./git-repository.ts";
import { parseStatus, readDirectoryStatus, sumNumstat } from "./git-status.ts";

const head = "a".repeat(40);
const temps: string[] = [];
afterEach(async () => { await Promise.all(temps.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function tmp() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "asterism-directory-git-")));
  temps.push(root);
  return root;
}
const signal = new AbortController().signal;

it("reads porcelain headers and scopes paths without treating rename sources as records", () => {
  const output = [
    `# branch.oid ${head}`, "# branch.head topic",
    "1 .M N... 100644 100644 100644 hH hI app/src/main with\tspaces\n.ts",
    "2 R. N... 100644 100644 100644 hH hI R100 app/new.ts", "? app/old.ts",
    "? app/scratch/", "1 A. N... 100644 100644 100644 hH hI app/ new.ts",
    "1 A. N... 100644 100644 100644 hH hI other/outside.ts", "! app/ignored.log",
    "u DU N... 100644 000000 100644 100644 h1 h2 h3 app/gone.ts", "",
  ].join("\0");
  expect(parseStatus(output, "app/")).toEqual({ head, files: [
    { path: "src/main with\tspaces\n.ts", status: "modified" }, { path: "new.ts", status: "renamed" },
    { path: "scratch/", status: "untracked" }, { path: " new.ts", status: "added" }, { path: "gone.ts", status: "deleted" },
  ] });
});

it("sums text numstat counts without counting binary entries", () => {
  expect(sumNumstat("3\t1\ta.ts\x00-\t-\timage.png\x0010\t0\tb.ts\x00")).toEqual({ added: 13, removed: 1 });
});

it("doesn't spawn Git outside a worktree and distinguishes missing Git from an actual probe failure", async () => {
  const root = await tmp();
  const run = async () => { throw new Error("A plain directory should not spawn Git"); };
  expect(await discoverGitWorktree(root, signal, run)).toBeNull();
  await mkdir(join(root, ".git"));
  expect(await discoverGitWorktree(root, signal, async () => { throw new GitExit("ENOENT", "Git not found"); })).toBeNull();
  await expect(discoverGitWorktree(root, signal, async () => { throw new GitExit(128, "invalid gitfile or repository"); }))
    .rejects.toThrow("invalid gitfile or repository");
});

it("matches real Git status in a scoped subdirectory across staging and branch changes", async () => {
  const root = await tmp(), scoped = join(root, "app area");
  const run = (...args: string[]) => git(root, args, signal);
  await run("init", "-qb", "initial");
  await mkdir(scoped);
  await writeFile(join(scoped, "tracked.txt"), "one\ntwo\n");
  await writeFile(join(root, "outside.txt"), "original\n");
  await run("add", ".");
  const repository = (await discoverGitWorktree(scoped, signal))!;
  expect(await discoverGitWorktree(join(root, ".git"), signal)).toBeNull();
  expect(await readDirectoryStatus(scoped, repository, signal)).toEqual({
    files: [{ path: "tracked.txt", status: "added" }], added: 2, removed: 0,
  });
  await run("-c", "user.name=Directory Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "initial");
  // No extra diff or HEAD probe is needed for a clean repository.
  const summary = await readDirectoryStatus(scoped, repository, signal, (cwd, args, signal) => {
    if (args[0] !== "status") throw new Error(`Unexpected Git command: ${args[0]}`);
    return git(cwd, args, signal);
  });
  expect(summary).toEqual({ files: [], added: 0, removed: 0 });
  await writeFile(join(scoped, "tracked.txt"), "one\nthree\nfour\n");
  await run("add", "app area/tracked.txt");
  await writeFile(join(scoped, "tracked.txt"), "one\nthree\nfour\nfive\n");
  await writeFile(join(scoped, "untracked.txt"), "not included in numstat\n");
  await writeFile(join(root, "outside.txt"), "outside changes should not count\n");
  expect(await readDirectoryStatus(scoped, repository, signal)).toEqual({
    files: [{ path: "tracked.txt", status: "modified" }, { path: "untracked.txt", status: "untracked" }], added: 3, removed: 1,
  });
  await writeFile(join(scoped, "tracked.txt"), "one\ntwo\n");
  const cancelled = await readDirectoryStatus(scoped, repository, signal);
  expect(cancelled.files).toContainEqual({ path: "tracked.txt", status: "modified" });
  expect({ added: cancelled.added, removed: cancelled.removed }).toEqual({ added: 0, removed: 0 });
  const checkout = await tmp();
  await run("worktree", "add", "-qb", "linked", checkout);
  const linked = (await discoverGitWorktree(join(checkout, "app area"), signal))!;
  expect(linked).toMatchObject({ worktree: checkout, commonDir: join(root, ".git"), prefix: "app area/" });
  expect(linked.gitDir).not.toBe(linked.commonDir);
  await git(checkout, ["checkout", "-qb", "other"], signal);
  await writeFile(join(checkout, "app area", "tracked.txt"), "new baseline\n");
  await git(checkout, ["add", "."], signal);
  await git(checkout, ["-c", "user.name=Directory Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "new baseline"], signal);
  expect(await readDirectoryStatus(join(checkout, "app area"), linked, signal)).toEqual({ files: [], added: 0, removed: 0 });
});
