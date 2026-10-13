import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineRecord, type SessionRecord } from "@atelier/sdk/contracts";
import { Execution } from "../modules/agent/records.ts";
import { sessionView } from "./records.ts";
import { attached, event, node, text } from "../session/test-nodes.ts";

const contract = defineRecord("example.plugin/value", { schema: z.object({ value: z.number() }) });
const record: SessionRecord = { id: "r", sessionId: "s", parentId: null, sequence: 1, createdAt: "2026-10-11T00:00:00Z",
  contract: { id: contract.id }, source: { plugin: "example.plugin", resource: null }, data: { value: 1 }, context: null };
const value = (id: string, parentId: string | null, data: unknown, type = contract.id) =>
  node(id, parentId, event(type, data as never, { source: { plugin: "example.plugin", resource: null } }));

describe("共享时间轴的契约解码", () => {
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
  it("具型 first 不跳过坏记录；通用读取仍可获取整条时间轴和原始 payload", () => {
    const first = value("r", null, { value: "bad" }), second = value("r2", "r", { value: 2 });
    const view = sessionView("s", "Timeline", [first, second], [first, second]);
    expect(view.records.first(contract, { scope: "path" })).toMatchObject({ status: "unknown", record: { id: "r" } });
    expect(view.records.query(contract, { scope: "session" }).map(decoded => decoded.status)).toEqual(["unknown", "known"]);
    expect(view.records.all({ scope: "session" }).map(record => record.data)).toEqual([{ value: "bad" }, { value: 2 }]);
    expect(() => { (view.records.all({ scope: "session" })[0]!.data as { value: string }).value = "changed"; }).toThrow();
  });
  it("执行块按插件记录原样保存与读取，宿主不改写载荷，来源取自节点", () => {
    const block = node("block", null, text("a", "response", 0, "Answer", { continuation: { opaque: "resume" },
      completion: { usage: null, finishReason: "stop", rawFinishReason: null, providerResponseId: "remote" } }));
    const decoded = sessionView("s", "Model", [block], [block]).records.first(Execution, { scope: "path" });
    expect(decoded).toMatchObject({ status: "known", record: { source: { resource: { id: "a" } } }, data: {
      type: "block", block: { kind: "text", text: "Answer", continuation: { opaque: "resume" }, completion: { providerResponseId: "remote" } },
    } });
  });
  it("具型 last 按范围索引仅解码目标；最新坏记录不回退，固定快照不受后续追加影响", () => {
    const first = value("first", null, { value: 1 });
    const branch = value("branch", "first", { value: "bad" });
    const unrelated = Array.from({ length: 1000 }, (_, i) => value(`noise-${i}`, "first", { value: i }, "other/noise"));
    const nodes = [first, ...unrelated, branch];
    const view = sessionView("s", "Indexed", nodes, [first]);
    const decode = vi.spyOn(contract, "decode");
    expect(view.records.last(contract, { scope: "session" })).toMatchObject({ status: "unknown", record: { id: "branch" } });
    expect(decode).toHaveBeenCalledTimes(1);
    expect(view.records.last(contract, { scope: "path" })).toMatchObject({ status: "known", data: { value: 1 } });
    expect(decode).toHaveBeenCalledTimes(2);
    expect(view.records.first(contract, { scope: "session" })).toMatchObject({ status: "known", record: { id: "first" } });
    expect(decode).toHaveBeenCalledTimes(3);
    expect(view.records.last(Execution, { scope: "session" })).toBeNull();
    nodes.push(value("later", "first", { value: 3 }));
    expect(view.records.last(contract, { scope: "session" })?.record.id).toBe("branch");
    decode.mockRestore();
  });
  it("模型可见文本与接收者进入信封 context，原事件身份与载荷保留", () => {
    const linked = node("event", null, attached("a", "directory", "A resource was linked."));
    expect(sessionView("s", "", [linked], [linked]).records.all({ scope: "path" })[0]).toMatchObject({
      contract: { id: "resource_attached" }, data: { id: "directory", agentId: "a" },
      context: { text: "A resource was linked.", recipient: "a" },
    });
  });
});
