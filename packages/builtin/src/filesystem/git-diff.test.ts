import { applyPatch, parsePatch } from "diff";
import { expect, it } from "vitest";
import { gitDiffResult, untrackedDiff } from "./git-diff.ts";

function patchFor(contents: string, path = "file.txt") {
  const result = untrackedDiff(path, Buffer.from(contents), "100644");
  if (result.kind !== "patch") throw new Error(`Expected patch, got ${result.kind}`);
  return result.patch;
}

it("represents untracked Unicode and final-newline state as an addition against an absent file", () => {
  const patch = patchFor("new\n更新");
  expect(patch).toContain("new file mode 100644\n--- /dev/null\n+++ b/file.txt\n");
  expect(patch).toContain("\\ No newline at end of file\n");
  expect(applyPatch("", patch)).toBe("new\n更新");
});

it("keeps empty untracked files visible as creations", () => {
  expect(patchFor("")).toBe("diff --git a/file.txt b/file.txt\nnew file mode 100644\n");
});

it("quotes unusual paths without allowing them to create extra patch records", () => {
  const path = 'sub/更新\n"\\[literal].txt';
  const patches = parsePatch(patchFor("new\n", path));
  expect(patches).toHaveLength(1);
  expect(patches[0]!.newFileName).toBe(`b/${path}`);
});

it("distinguishes invalid UTF-8 and binary contents from a valid replacement character", () => {
  for (const bytes of [Buffer.from([0xff]), Buffer.from("a\0b"), Buffer.from("%PDF-1.7\n")])
    expect(untrackedDiff("file", bytes, "100644")).toEqual({ kind: "binary" });
  expect(applyPatch("", patchFor("valid �\n"))).toBe("valid �\n");
});

it("recognizes Git binary markers without mistaking changed text for metadata", () => {
  expect(gitDiffResult("diff --git a/image b/image\nBinary files a/image and b/image differ\n")).toEqual({ kind: "binary" });
  const text = "diff --git a/file b/file\n@@ -0,0 +1 @@\n+Binary files a/image and b/image differ\n";
  expect(gitDiffResult(text)).toEqual({ kind: "patch", patch: text });
});
