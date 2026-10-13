import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineRecord, pluginNamespace, type SessionRecord } from "@atelier/sdk/contracts";
import { sessionSnapshot, sessionView } from "./records.ts";
import { nodeView } from "../session/view.ts";
import { attached, created, event, node, removed } from "../session/test-nodes.ts";
import { SessionTree } from "../session/tree.ts";
import { sessionSchemaSql } from "../session/schema.ts";
import { sessionNodeSchema } from "../shared/session.ts";

const databases: DatabaseSync[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const db of databases.splice(0)) db.close(); });
function stored() {
  const db = new DatabaseSync(":memory:"); databases.push(db);
  db.exec(sessionSchemaSql);
  const tree = new SessionTree(db);
  return { tree, sessionId: tree.create("Captured title") };
}

const contract = defineRecord("example.plugin/value", { schema: z.object({ value: z.number() }) });
const record: SessionRecord = { id: "r", sessionId: "s", parentId: null, sequence: 1, createdAt: "2026-10-11T00:00:00Z",
  contract: { id: contract.id }, source: { plugin: "example.plugin", resource: null }, data: { value: 1 }, context: null };
const value = (id: string, parentId: string | null, data: unknown, type = contract.id) =>
  node(id, parentId, event(type, data as never, { source: { plugin: "example.plugin", resource: null } }));

describe("共享时间线的契约解码", () => {
  it("按领域身份和实际形状解码，不合 schema 的数据返回 unknown 并保留原始记录", () => {
    expect(contract.decode({ ...record, contract: { id: "another.plugin/event" } })).toBeNull();
    expect(contract.decode(record)).toMatchObject({ status: "known", data: { value: 1 } });
    const invalid = { ...record, data: { value: "bad" } };
    expect(contract.decode(invalid)).toEqual({ status: "unknown", record: invalid, reason: "invalid_data" });
  });
  it("升级失败也不损坏原始数据，不阻断其他消费者读取同一信封", () => {
    const next = defineRecord(contract.id, { schema: contract.schema.transform(data => {
      data.value = 99; throw new Error("Unknown legacy payload.");
    }) });
    expect(next.decode(record)).toEqual({ status: "unknown", record, reason: "invalid_data" });
    expect(record.data).toEqual({ value: 1 });
    expect(contract.decode(record)).toMatchObject({ status: "known", data: { value: 1 } });
  });
  it("具型 first 不跳过坏记录；通用读取仍可获取整条时间线和原始 payload", () => {
    const first = value("r", null, { value: "bad" }), second = value("r2", "r", { value: 2 });
    const view = sessionView(nodeView("s", "Timeline", [first, second], second.id));
    expect(view.records.first(contract, { scope: "timeline" })).toMatchObject({ status: "unknown", record: { id: "r" } });
    expect(view.records.query(contract, { scope: "session" }).map(decoded => decoded.status)).toEqual(["unknown", "known"]);
    expect(view.records.all({ scope: "session" }).map(record => record.data)).toEqual([{ value: "bad" }, { value: 2 }]);
    expect(() => { (view.records.all({ scope: "session" })[0]!.data as { value: string }).value = "changed"; }).toThrow();
  });
  it("不透明插件载荷与来源按信封原样交付，宿主不解释字段", () => {
    const opaque = { value: 7, future: { secret: "plugin-owned", items: [null, "resume"] } };
    const declared = defineRecord("example.plugin/opaque", { schema: z.json() });
    const saved = node("opaque", null, event(declared.id, opaque, {
      source: { plugin: "example.plugin", resource: { id: "resource", kind: "example.plugin/resource" } },
    }));
    const decoded = sessionView(nodeView("s", "", [saved], saved.id)).records.first(declared, { scope: "timeline" });
    expect(decoded).toMatchObject({ status: "known", data: opaque,
      record: { source: { plugin: "example.plugin", resource: { id: "resource", kind: "example.plugin/resource" } } } });
  });
  it("具型 last 按范围仅解码目标；最新坏记录不回退，固定快照不受后续追加影响", () => {
    const first = value("first", null, { value: 1 });
    const branch = value("branch", "first", { value: "bad" });
    const unrelated = Array.from({ length: 1000 }, (_, i) => value(`noise-${i}`, "first", { value: i }, "other/noise"));
    const nodes = [first, ...unrelated, branch];
    const view = sessionView(nodeView("s", "Timeline", nodes, first.id));
    const decode = vi.spyOn(contract, "decode");
    expect(view.records.last(contract, { scope: "session" })).toMatchObject({ status: "unknown", record: { id: "branch" } });
    expect(decode).toHaveBeenCalledTimes(1);
    expect(view.records.last(contract, { scope: "timeline" })).toMatchObject({ status: "known", data: { value: 1 } });
    expect(decode).toHaveBeenCalledTimes(2);
    expect(view.records.first(contract, { scope: "session" })).toMatchObject({ status: "known", record: { id: "first" } });
    expect(decode).toHaveBeenCalledTimes(3);
    expect(view.records.last(defineRecord("other.plugin/absent", { schema: z.json() }), { scope: "session" })).toBeNull();
    nodes.push(value("later", "first", { value: 3 }));
    expect(view.records.last(contract, { scope: "session" })?.record.id).toBe("branch");
    decode.mockRestore();
  });
  it("模型可见文本与接收者进入信封 context，原事件身份与载荷保留", () => {
    const linked = node("event", null, attached("a", "directory", "A resource was linked."));
    expect(sessionView(nodeView("s", "", [linked], linked.id)).records.all({ scope: "timeline" })[0]).toMatchObject({
      contract: { id: "resource_attached" }, data: { id: "directory", agentId: "a" },
      context: { text: "A resource was linked.", recipient: "a" },
    });
  });

  // 固定快照契约：首次读取即使晚于追加、标题覆盖和分叉，也只能看到捕获位置。
  it("存储观察柄延后读取时仍固定路径、会话上界、标题与资源存在性", () => {
    const { tree, sessionId } = stored();
    const Resource = pluginNamespace("example.plugin").resource("item", z.object({}));
    const empty = sessionSnapshot(tree.view(sessionId));
    const first = tree.appendToTimeline(sessionId, event(contract.id, { value: 1 }));
    const object = tree.appendToTimeline(sessionId, created("item", "Item", Resource.kind));
    const before = sessionSnapshot(tree.view(sessionId));
    const old = tree.appendToTimeline(sessionId, removed("item"));
    const removedView = sessionSnapshot(tree.view(sessionId));
    tree.select(sessionId, first.id);
    const branch = tree.appendToTimeline(sessionId, event(contract.id, { value: 2 }));
    tree.setTitle(sessionId, "Current title");
    const current = sessionSnapshot(tree.view(sessionId));

    expect(empty.records.all({ scope: "session" })).toEqual([]);
    expect(empty.records.all({ scope: "timeline" })).toEqual([]);
    expect(empty.resources.all()).toEqual([]);
    expect(before.title).toBe("Captured title");
    expect(before.position.nodeId).toBe(object.id);
    expect(before.records.all({ scope: "timeline" }).map(record => record.id)).toEqual([first.id, object.id]);
    expect(before.records.all({ scope: "session" }).map(record => record.id)).toEqual([first.id, object.id]);
    expect(before.records.last(contract, { scope: "session" })).toMatchObject({ record: { id: first.id } });
    expect(before.resources.get(Resource, "item")).toMatchObject({ status: "known", resource: { title: "Item" } });
    expect(removedView.resources.get(Resource, "item")).toBeNull();
    expect(removedView.records.all({ scope: "timeline" }).map(record => record.id)).toEqual([first.id, object.id, old.id]);
    expect(current.resources.all()).toEqual([]);
    expect(current.records.query(contract, { scope: "timeline" }).map(record => record.record.id)).toEqual([first.id, branch.id]);
  });

  // 序号来自会话内追加顺序；不能用跨会话数据库 seq 或当前路径下标替代。
  it("旁支与其他会话交错追加不改变公开记录序号", () => {
    const { tree, sessionId } = stored();
    const other = tree.create("Other");
    tree.appendToTimeline(other, event(contract.id, { value: 0 }));
    const first = tree.appendToTimeline(sessionId, event(contract.id, { value: 1 }));
    const old = tree.appendToTimeline(sessionId, event(contract.id, { value: 2 }));
    tree.appendToTimeline(other, event(contract.id, { value: 0 }));
    tree.select(sessionId, first.id);
    const branch = tree.appendToTimeline(sessionId, event(contract.id, { value: 3 }));
    const view = sessionSnapshot(tree.view(sessionId));
    expect(view.records.all({ scope: "timeline" }).map(record => record.sequence)).toEqual([1, 3]);
    expect(view.records.all({ scope: "session" }).map(record => record.sequence)).toEqual([1, 2, 3]);
    expect(view.records.first(contract, { scope: "timeline" })?.record.sequence).toBe(1);
    expect(view.records.last(contract, { scope: "timeline" })?.record.sequence).toBe(3);
    expect(tree.sequences(sessionId, [first, old, branch])).toEqual([1, 2, 3]);
  });

  // 按需读取契约：构造观察柄不物化历史；具型查询只解析命中的正文，坏尾记录仍返回 unknown。
  it("创建观察柄不解析节点，首尾和具型查询只物化所选记录", () => {
    const { tree, sessionId } = stored();
    const first = tree.appendToTimeline(sessionId, event(contract.id, { value: 1 }));
    tree.appendToTimeline(sessionId, event("example.plugin/noise", { text: "Unrelated body" }));
    const last = tree.appendToTimeline(sessionId, event(contract.id, { value: "invalid" }));
    const parse = vi.spyOn(sessionNodeSchema, "parse");
    const view = sessionSnapshot(tree.view(sessionId));
    expect(parse).not.toHaveBeenCalled();
    expect(view.records.last(contract, { scope: "timeline" })).toMatchObject({ status: "unknown", record: { id: last.id } });
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockClear();
    expect(view.records.first(contract, { scope: "timeline" })).toMatchObject({ status: "known", record: { id: first.id } });
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockClear();
    expect(view.records.query(contract, { scope: "timeline" }).map(record => record.status)).toEqual(["known", "unknown"]);
    expect(parse).toHaveBeenCalledTimes(2);
  });
});
