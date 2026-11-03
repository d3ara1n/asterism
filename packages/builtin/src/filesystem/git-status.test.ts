import { expect, it } from "vitest";
import { parseStatus, sumNumstat } from "./git-status.ts";

it("re-roots repository paths at the resource prefix and skips the original path of renames", () => {
  const output = [
    " M app/src/main.ts",
    "R  app/new.ts", "app/old.ts",
    "?? app/scratch/",
    "A  other/outside.ts",
    "!! app/ignored.log",
    " D app/gone.ts",
    "",
  ].join("\0");
  expect(parseStatus(output, "app/")).toEqual([
    { path: "src/main.ts", status: "modified" },
    { path: "new.ts", status: "renamed" },
    { path: "scratch/", status: "untracked" },
    { path: "gone.ts", status: "deleted" },
  ]);
});

it("keeps paths unchanged at the repository root", () => {
  expect(parseStatus("AM added.ts\0", "")).toEqual([{ path: "added.ts", status: "added" }]);
});

it("sums text line counts and ignores binary files", () => {
  expect(sumNumstat("3\t1\ta.ts\x00-\t-\timage.png\x0010\t0\tb.ts\x00")).toEqual({ added: 13, removed: 1 });
  expect(sumNumstat("")).toEqual({ added: 0, removed: 0 });
});
