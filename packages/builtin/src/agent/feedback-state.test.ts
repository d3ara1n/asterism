import { expect, it, vi } from "vitest";
import type { ObjectExecutor } from "@asterism/sdk/runtime";
import { AgentSoftwareFeedback } from "./feedback.ts";
import { createAgentFeedback } from "./feedback-state.ts";

// Model results enter only the in-memory view, while software failures produce notifications only; multiple model failures can occur consecutively at the same processing position.
it("Routes feedback by source, preserves its occurrence position, and cleans it up when the resource is released", () => {
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

// Error feedback may be appended during compression; finalizing the activity must preserve it, hand successful activity over to persistent records, and keep failures/cancellations at their original positions.
it("Hands off compression activity according to outcome; successful retries do not erase earlier failures or intervening feedback", () => {
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
