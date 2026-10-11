import { describe, expect, it } from "vitest";
import { z } from "zod";
import { workbenchSnapshotSchema } from "../../../shared/workbench";
import { defineData, present } from "@atelier/sdk/contracts";
import { cardRenderer, ViewRegistry } from "../../modules/registry";
import { workbenchNodes } from "./nodes";

const contract = defineData("test.card", 1, z.null());
const registry = new ViewRegistry([{ resources: [], tools: [], cards: [cardRenderer(contract, {
  width: 560, height: 640, minWidth: 480, minHeight: 480, Body: () => null,
})] }]);
const snapshot = () => workbenchSnapshotSchema.parse({
  id: "00000000-0000-4000-8000-000000000001", title: "Test",
  objects: [{ id: "a", kind: "test", title: "Card", presentation: present(contract, null) }],
  views: [{ objectId: "a", position: { x: 10, y: 20 }, hidden: false, collapsed: false, size: { width: 800, height: 900 } }],
  viewport: { x: 0, y: 0, zoom: 1 }, links: [],
});
const onView = () => {};

describe("卡片尺寸与投影协调", () => {
  it("折叠只撤销当前高度，展开恢复保存的宽高，恢复默认清除尺寸覆盖", () => {
    const state = snapshot();
    const expanded = workbenchNodes(state, [], registry, onView, new Map());
    state.views[0].collapsed = true;
    const collapsed = workbenchNodes(state, expanded, registry, onView, new Map());
    expect(collapsed[0]).toMatchObject({ width: 800, height: undefined });
    state.views[0].collapsed = false;
    expect(workbenchNodes(state, collapsed, registry, onView, new Map())[0]).toMatchObject({ width: 800, height: 900 });
    expect(workbenchNodes(state, expanded, registry, onView, new Map([["a", { size: null }]]))[0])
      .toMatchObject({ width: 560, height: 640 });
  });

  it("拖动与松手后的未确认尺寸不被旧投影覆盖，内容与选中状态仍更新", () => {
    const state = snapshot();
    const previous = workbenchNodes(state, [], registry, onView, new Map());
    previous[0] = { ...previous[0], width: 1000, height: 1100, resizing: true, selected: true };
    state.objects[0] = { ...state.objects[0], title: "Updated" };
    const resizing = workbenchNodes(state, previous, registry, onView, new Map());
    expect(resizing[0]).toMatchObject({ width: 1000, height: 1100, selected: true, data: { object: { title: "Updated" } } });
    resizing[0].resizing = false;
    const pending = new Map([["a", { size: { width: 1200, height: 1300 } }]]);
    expect(workbenchNodes(state, resizing, registry, onView, pending)[0]).toMatchObject({ width: 1200, height: 1300 });
    state.views[0].size = pending.get("a")!.size;
    expect(workbenchNodes(state, resizing, registry, onView, new Map())[0]).toMatchObject({ width: 1200, height: 1300 });
  });

  it("使用模块的尺寸下限；视口缩放不改变卡片尺寸", () => {
    const state = snapshot();
    state.views[0].size = { width: 300, height: 200 };
    state.viewport.zoom = 0.25;
    expect(workbenchNodes(state, [], registry, onView, new Map())[0]).toMatchObject({ width: 480, height: 480 });
  });
});
