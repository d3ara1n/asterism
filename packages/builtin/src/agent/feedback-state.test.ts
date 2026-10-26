import { expect, it, vi } from "vitest";
import type { ObjectExecutor } from "@asterism/sdk/runtime";
import { AgentSoftwareFeedback } from "./feedback.ts";
import { createAgentFeedback } from "./feedback-state.ts";

// 模型结果只进内存视图，软件失败只通知；同一处理位置可以连续发生多次模型失败。
it("按来源路由反馈，保留发生位置并随资源释放清理", () => {
  let nodeId = "input";
  const publish = vi.fn(), commit = vi.fn();
  const object = {
    ref: { id: "agent" }, session: { snapshot: () => ({ position: { nodeId } }) },
    invalidate: vi.fn(), events: { publish }, commit,
  } as unknown as ObjectExecutor;
  const state = createAgentFeedback();
  const model = { origin: "model" as const, code: "provider_error", level: "error" as const, message: "HTTP 429" };
  state.report(object, model, true);
  state.report(object, { ...model, message: "HTTP 500" }, true);
  nodeId = "answer";
  const software = { ...model, origin: "software" as const, code: "event_delivery", message: "Disk unavailable" };
  state.report(object, software, true);
  expect(state.get(object).inline.map(item => [item.afterNodeId, item.message])).toEqual([
    ["input", "HTTP 429"], ["input", "HTTP 500"],
  ]);
  expect(new Set(state.get(object).inline.map(item => item.id)).size).toBe(2);
  expect(state.get(object).interruptions).toEqual(["input", "input", "answer"]);
  expect(publish).toHaveBeenCalledExactlyOnceWith(AgentSoftwareFeedback, software);
  expect(commit).not.toHaveBeenCalled();
  state.delete(object.ref.id);
  expect(state.get(object)).toEqual({ inline: [], interruptions: [], compressions: [] });
});

// 压缩中可能追加错误反馈；终结活动须保留这些反馈，成功移交持久记录，失败／取消保留原位置。
it("压缩活动按结局交接，重试成功不清除较早的失败与中途反馈", () => {
  let nodeId = "input";
  const object = { ref: { id: "agent" }, session: { snapshot: () => ({ position: { nodeId } }) },
    invalidate: vi.fn(), events: { publish: vi.fn() } } as unknown as ObjectExecutor;
  const state = createAgentFeedback();
  const fail = state.beginCompression(object);
  expect(state.get(object).compressions.map(value => [value.afterNodeId, value.status])).toEqual([["input", "running"]]);
  state.report(object, { origin: "model", code: "context_compression_failed", level: "warning", message: "Failed" });
  fail("failed");
  nodeId = "next";
  state.beginCompression(object)("completed");
  state.beginCompression(object)("cancelled");
  expect(state.get(object).compressions.map(value => [value.afterNodeId, value.status])).toEqual([["input", "failed"], ["next", "cancelled"]]);
  expect(state.get(object).inline.map(value => value.message)).toEqual(["Failed"]);
});
