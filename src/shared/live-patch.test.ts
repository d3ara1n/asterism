import { expect, it } from "vitest";
import { applyLive, diffLive } from "./live-patch.ts";
import type { LiveBlock } from "./session.ts";

const tool = (result: unknown, extra: Partial<LiveBlock> = {}) => ({ id: "r:0", objectId: "a", responseId: "r", ordinal: 0, kind: "toolcall", name: "exec",
  argumentsText: "", arguments: { command: "ls" }, state: "executing", invocation: null, result: { kind: "running", data: result }, ...extra }) as LiveBlock;

// Streaming progress: applying patches in order from the baseline must reconstruct current backend lists; append-only content sends tails only.
it.each([
  ["string tail append in execution output", tool({ output: "a" }), tool({ output: "abc", lines: 1 })],
  ["array growth and changes within elements", tool({ items: [{ text: "x" }] }), tool({ items: [{ text: "xy" }, { text: "z" }] })],
  ["whole-value replacement for sliding-window truncation and array shortening", tool({ output: "abcdef", items: [1, 2, 3] }), tool({ output: "defghi", items: [1] })],
  ["key deletion and type changes", tool({ output: "a", extra: { n: 1 } }), tool({ output: ["a"] })],
  ["output changes from null to object", tool(null), tool({ output: "x" })],
])("%s", (_name, before, after) => {
  const patch = diffLive([before], [after]);
  expect(patch).not.toBeNull();
  expect(applyLive([before], patch!)).toEqual([after]);
});

it("append-only live output sends only new tails while unchanged fields retain object identity", () => {
  const before = tool({ output: "x".repeat(10_000) }), after = tool({ output: "x".repeat(10_000) + "tail" });
  const patch = diffLive([before], [after])!;
  expect(patch.changes).toEqual([{ id: "r:0", kind: "update", ops: [{ path: ["result", "data", "output"], append: "tail" }] }]);
  const [applied] = applyLive([before], patch);
  expect((applied as Extract<LiveBlock, { kind: "toolcall" }>).arguments).toBe((before as Extract<LiveBlock, { kind: "toolcall" }>).arguments);
  expect(diffLive([after], [after])).toBeNull();
});
