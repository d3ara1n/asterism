import { describe, expect, it, vi } from "vitest";
import { ObjectRetention } from "./retention.ts";

describe("Object retention", () => {
  // The same object and key return the same instance; when an object leaves the current projection, release only its entries and recreate them afterward.
  it("releases objects absent from the projection and retains those still present", () => {
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

  // A plugin release failure does not affect other entries, and the error is exposed directly.
  it("releases remaining entries when one entry fails to release", () => {
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
});
