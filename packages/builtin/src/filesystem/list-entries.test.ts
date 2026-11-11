import { describe, expect, it } from "vitest";

import { entryPath, sortEntries } from "./list-entries.ts";

describe("directory list entries", () => {
  it("groups directories before files and special entries, in natural name order", () => {
    const sorted = sortEntries([
      { name: "file10.ts", type: "file" }, { name: "link", type: "other" }, { name: "src", type: "directory" },
      { name: "file2.ts", type: "file" }, { name: "Docs", type: "directory" },
    ]);
    expect(sorted.map(entry => entry.name)).toEqual(["Docs", "src", "file2.ts", "file10.ts", "link"]);
  });

  it("joins entry names to the listed directory without duplicating the root or separators", () => {
    expect(entryPath(".", "README.md")).toBe("README.md");
    expect(entryPath("src", "main.ts")).toBe("src/main.ts");
    expect(entryPath("src/", "main.ts")).toBe("src/main.ts");
  });
});
