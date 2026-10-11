import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineRecord, type SessionRecord } from "@atelier/sdk/contracts";
import { Execution, ContextNotice } from "../modules/agent/records.ts";
import { sessionView } from "./records.ts";
import { emptyCompletion, type SessionNode } from "../shared/session.ts";

const contract = defineRecord("example.plugin/value", { schema: z.object({ value: z.number() }) });
const record: SessionRecord = { id: "r", sessionId: "s", parentId: null, sequence: 1, createdAt: "2026-10-11T00:00:00Z",
  contract: { id: contract.id }, resource: null, data: { value: 1 } };

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
    const node = { id: "r", sessionId: "s", parentId: null, createdAt: record.createdAt, kind: "event" as const,
      type: contract.id, data: { value: "bad" }, agentId: null, model: null };
    const second = { ...node, id: "r2", parentId: node.id, data: { value: 2 } };
    const view = sessionView("s", "Timeline", [node, second], [node, second]);
    expect(view.records.first(contract, { scope: "path" })).toMatchObject({ status: "unknown", record: { id: "r" } });
    expect(view.records.query(contract, { scope: "session" }).map(decoded => decoded.status)).toEqual(["unknown", "known"]);
    expect(view.records.all({ scope: "session" }).map(record => record.data)).toEqual([{ value: "bad" }, { value: 2 }]);
    expect(() => { (view.records.all({ scope: "session" })[0]!.data as { value: string }).value = "changed"; }).toThrow();
  });
  it("既有物理模型块映为共识载荷，来源、请求起点、续接与迟到终态完整保留", () => {
    const node: SessionNode = {
      id: "block", sessionId: "s", parentId: null, createdAt: record.createdAt,
      ...emptyCompletion, kind: "text", agentId: "a", responseId: "response", requestParentId: null, ordinal: 0,
      complete: true, continuation: { opaque: "resume" }, model: "p/m", adapter: "adapter", scope: "scope", text: "Answer",
      finishReason: "stop", providerResponseId: "remote",
    };
    const decoded = sessionView("s", "Model", [node], [node]).records.first(Execution, { scope: "path" });
    expect(decoded).toMatchObject({ status: "known", data: {
      type: "block", block: { kind: "text", text: "Answer", requestParentId: null, continuation: { opaque: "resume" },
      source: { model: "p/m", adapter: "adapter", scope: "scope" }, completion: { finishReason: "stop", providerResponseId: "remote" },
    } } });
  });
  it("环境可见性经具型记录读取，原始事件身份与载荷保留", () => {
    const node: SessionNode = { id: "event", sessionId: "s", parentId: null, createdAt: record.createdAt,
      kind: "event", type: "resource_attached", agentId: "a", data: { id: "directory" }, model: "A resource was linked." };
    expect(sessionView("s", "", [node], [node]).records.first(ContextNotice, { scope: "path" })).toMatchObject({
      status: "known", data: { text: node.model, recipient: "a", origin: { type: node.type, data: node.data } },
    });
  });
});
