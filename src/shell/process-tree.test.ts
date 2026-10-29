import { describe, expect, it } from "vitest";
import { descendantsIn } from "./process-tree.ts";

describe("process tree snapshots", () => {
  // Actual servers wrapped by npx/uvx are grandchildren; reaping only direct children leaves servers behind. Deeper descendants terminate before parents to prevent parents from respawning children.
  it("collects descendants across multiple levels and orders deeper descendants before parents", () => {
    const table = " 10 1\n 20 10\n 30 20\n 40 10\n 50 99\n";
    expect(descendantsIn(table, 10)).toEqual([30, 20, 40]);
  });
  // Windows process tables may contain parent-child cycles caused by pid reuse; traversal must terminate without listing root itself as a descendant.
  it("parent-child cycles do not cause infinite traversal", () => {
    expect(descendantsIn("10 30\r\n20 10\r\n30 20\r\n", 10)).toEqual([30, 20]);
  });
});
