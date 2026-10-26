import { expect, it } from "vitest";
import { applyLive, diffLive } from "./live-patch.ts";
import type { LiveBlock } from "./session.ts";

const tool = (result: unknown, extra: Partial<LiveBlock> = {}) => ({ id: "r:0", objectId: "a", responseId: "r", ordinal: 0, kind: "toolcall", name: "exec",
  argumentsText: "", arguments: { command: "ls" }, state: "executing", invocation: null, result: { kind: "running", data: result }, ...extra }) as LiveBlock;

// 流式进度：接收端从基线依次应用补丁必须重建后台的当前列表；只追加的内容只传尾部。
it.each([
  ["运行结果的字符串尾部追加", tool({ output: "a" }), tool({ output: "abc", lines: 1 })],
  ["数组增长与元素内部变化", tool({ items: [{ text: "x" }] }), tool({ items: [{ text: "xy" }, { text: "z" }] })],
  ["滚动窗口截断与数组缩短整值替换", tool({ output: "abcdef", items: [1, 2, 3] }), tool({ output: "defghi", items: [1] })],
  ["删除键与类型变化", tool({ output: "a", extra: { n: 1 } }), tool({ output: ["a"] })],
  ["结果从 null 变为对象", tool(null), tool({ output: "x" })],
])("%s", (_name, before, after) => {
  const patch = diffLive([before], [after]);
  expect(patch).not.toBeNull();
  expect(applyLive([before], patch!)).toEqual([after]);
});

it("只追加的运行输出只发送新增尾部，未变化的字段保持对象身份", () => {
  const before = tool({ output: "x".repeat(10_000) }), after = tool({ output: "x".repeat(10_000) + "tail" });
  const patch = diffLive([before], [after])!;
  expect(patch.changes).toEqual([{ id: "r:0", kind: "update", ops: [{ path: ["result", "data", "output"], append: "tail" }] }]);
  const [applied] = applyLive([before], patch);
  expect((applied as Extract<LiveBlock, { kind: "toolcall" }>).arguments).toBe((before as Extract<LiveBlock, { kind: "toolcall" }>).arguments);
  expect(diffLive([after], [after])).toBeNull();
});
