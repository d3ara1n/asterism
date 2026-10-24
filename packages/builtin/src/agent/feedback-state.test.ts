import { expect, it, vi } from "vitest";
import type { ObjectExecutor } from "@atelier/sdk/runtime";
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
  expect(state.get(object)).toEqual({ inline: [], interruptions: [] });
});
