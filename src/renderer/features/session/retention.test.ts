import { describe, expect, it, vi } from "vitest";
import { focusedObject, setFocusedObject } from "../workbench/focus.ts";
import { ObjectRetention, objectRetention } from "./retention.ts";

describe("对象保留", () => {
  // 依据 plugin-sdk.md：同一对象同一 key 返回同一实例；对象离开当前投影时只释放该对象的条目，之后重新创建。
  it("按投影释放离开的对象，保留仍在的对象", () => {
    const retention = new ObjectRetention(), release = vi.fn();
    const kept = retention.get("s", "a", "k", () => ({ id: "a" }), release);
    retention.get("s", "b", "k", () => ({ id: "b" }), release);
    retention.get("other", "b", "k", () => ({ id: "other" }), release);
    expect(retention.get("s", "a", "k", () => ({ id: "new" }))).toBe(kept);

    retention.retainOnly("s", new Set(["a"]));
    expect(release.mock.calls).toEqual([[{ id: "b" }]]);
    expect(retention.get("s", "a", "k", () => ({ id: "new" }))).toBe(kept);
    expect(retention.get("s", "b", "k", () => ({ id: "recreated" }))).toEqual({ id: "recreated" });
  });

  // 依据 plugin-sdk.md：插件释放失败不影响其他条目，错误直接可见。
  it("一个条目释放失败时其余条目仍释放", () => {
    const retention = new ObjectRetention(), release = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      retention.get("s", "a", "broken", () => 1, () => { throw new Error("boom"); });
      retention.get("s", "a", "fine", () => 2, release);
      retention.retainOnly("s", new Set());
      expect(release).toHaveBeenCalledWith(2);
      expect(error).toHaveBeenCalledOnce();
    } finally { error.mockRestore(); }
  });

  // 依据 workbench.md 对象聚焦：对象离开当前投影时结束聚焦；改为聚焦其他对象后，旧对象离开投影不影响新聚焦。
  it("聚焦身份随对象离开投影结束", () => {
    setFocusedObject("focus-session", "a");
    setFocusedObject("focus-session", "b");
    objectRetention.retainOnly("focus-session", new Set(["b"]));
    expect(focusedObject("focus-session")).toBe("b");
    objectRetention.retainOnly("focus-session", new Set());
    expect(focusedObject("focus-session")).toBeNull();
  });
});
