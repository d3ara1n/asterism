import { describe, expect, it } from "vitest";
import { workbenchSnapshotSchema, type CardSize, type WorkbenchSnapshot } from "../../../shared/workbench";
import { confirmCardSizes, saveCardSize, type SizeIntent } from "./size-intents";

function deferred() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(done => { resolve = done; });
  return { promise, resolve };
}
const snapshot = (size: CardSize | null): WorkbenchSnapshot => workbenchSnapshotSchema.parse({
  id: "00000000-0000-4000-8000-000000000001", title: "Test",
  objects: [{ id: "a", kind: "test", title: "Card", presentation: { contract: { id: "test", version: 1 }, data: null } }],
  views: [{ objectId: "a", position: { x: 0, y: 0 }, hidden: false, collapsed: false, size }],
  viewport: { x: 0, y: 0, zoom: 1 }, links: [],
});

describe("尺寸保存意图", () => {
  it("A → B → A 时，旧 A 和 B 的读取完成都不能清除最后 A 的意图", async () => {
    const a = { width: 840, height: 960 }, b = { width: 1120, height: 1280 };
    let current = snapshot(null);
    const pending = new Map<string, SizeIntent>();
    let displayed: CardSize | null = null;
    const project = (state: WorkbenchSnapshot | null) => {
      displayed = pending.get("a")?.size ?? state?.views[0].size ?? null;
    };
    const gates = [deferred(), deferred(), deferred()];
    const saves = [a, b, a].map((size, i) => saveCardSize({
      pending, objectId: "a", size, saveAndRead: () => gates[i].promise,
      read: () => current, project,
    }));
    current = snapshot(a); confirmCardSizes(pending, current); project(current);
    gates[0].resolve(true); await saves[0];
    expect(pending.has("a")).toBe(true);
    current = snapshot(b); confirmCardSizes(pending, current); project(current);
    gates[1].resolve(true); await saves[1];
    expect(displayed).toEqual(a);
    expect(pending.has("a")).toBe(true);
    current = snapshot(a);
    gates[2].resolve(true); await saves[2];
    expect(displayed).toEqual(a);
    expect(pending.size).toBe(0);
  });

  it("当前保存失败撤销覆盖，旧保存失败不撤销较新的意图", async () => {
    const current = snapshot({ width: 800, height: 900 });
    const pending = new Map<string, SizeIntent>();
    const gates = [deferred(), deferred()];
    let displayed: CardSize | null = null;
    const project = (state: WorkbenchSnapshot | null) => {
      displayed = pending.has("a") ? pending.get("a")!.size : state?.views[0].size ?? null;
    };
    const saves = gates.map((gate, i) => saveCardSize({
      pending, objectId: "a", size: { width: 1000 + i * 100, height: 1000 },
      saveAndRead: () => gate.promise, read: () => current, project,
    }));
    gates[0].resolve(false); await saves[0];
    expect(displayed).toEqual({ width: 1100, height: 1000 });
    gates[1].resolve(false); await saves[1];
    expect(pending.size).toBe(0);
    expect(displayed).toEqual({ width: 800, height: 900 });
  });

  it("受理后的读取失败保留尺寸，后续成功投影才确认", async () => {
    const size = { width: 1000, height: 1100 };
    const pending = new Map<string, SizeIntent>();
    await saveCardSize({
      pending, objectId: "a", size, saveAndRead: async () => true, read: () => null, project: () => {},
    });
    expect(pending.has("a")).toBe(true);
    confirmCardSizes(pending, snapshot({ width: 800, height: 900 }));
    expect(pending.has("a")).toBe(true);
    confirmCardSizes(pending, snapshot(size));
    expect(pending.size).toBe(0);
  });
});
