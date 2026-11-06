import { expect, it, vi } from "vitest";
import type { ObjectExecutor } from "@asterism-app/sdk/runtime";
import { createAgentFeedback } from "./feedback-state.ts";

// Consecutive failures can share a position; changing diagnostic origin must not lose a notice or move it to a notification.
it("Keeps model and software feedback at their occurrence positions and releases it with the resource", () => {
  let nodeId = "input";
  const publish = vi.fn(), commit = vi.fn();
  const object = {
    ref: { id: "agent" }, session: { snapshot: () => ({ position: { nodeId } }) },
    invalidate: vi.fn(), events: { publish }, commit,
  } as unknown as ObjectExecutor;
  const state = createAgentFeedback();
  const model = { origin: "model" as const, code: "provider_error", level: "error" as const, message: "HTTP 429" };
  state.report(object, { ...model, origin: "software", code: "execution_failed", message: "fetch failed" }, true);
  state.report(object, model, true);
  state.report(object, { ...model, message: "HTTP 500" }, true);
  nodeId = "answer";
  const software = { ...model, origin: "software" as const, code: "event_delivery", message: "Disk unavailable" };
  state.report(object, software, true);
  expect(state.get(object).inline.map(item => [item.afterNodeId, item.message])).toEqual([
    ["input", "fetch failed"], ["input", "HTTP 429"], ["input", "HTTP 500"], ["answer", "Disk unavailable"],
  ]);
  expect(new Set(state.get(object).inline.map(item => item.id)).size).toBe(4);
  expect(state.get(object).interruptions).toEqual(["input", "input", "input", "answer"]);
  expect(state.get(object).inline.at(-1)).toMatchObject(software);
  expect(publish).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  state.delete(object.ref.id);
  expect(state.get(object)).toEqual({ inline: [], interruptions: [], compressions: [], activity: null });
});

// Error feedback may be appended during compression; finalizing the activity must preserve it, hand successful activity over to persistent records, and keep failures/cancellations at their original positions.
it("Hands off compression activity according to outcome; successful retries do not erase earlier failures or intervening feedback", () => {
  let nodeId = "input";
  const object = { ref: { id: "agent" }, session: { snapshot: () => ({ position: { nodeId } }) },
    invalidate: vi.fn(), events: { publish: vi.fn() } } as unknown as ObjectExecutor;
  const state = createAgentFeedback();
  const fail = state.beginCompression(object);
  expect(state.get(object).compressions.map(value => [value.afterNodeId, value.status])).toEqual([["input", "running"]]);
  state.report(object, { origin: "software", code: "context_compression_failed", level: "warning", message: "Failed" });
  fail("failed");
  nodeId = "next";
  state.beginCompression(object)("completed");
  state.beginCompression(object)("cancelled");
  expect(state.get(object).compressions.map(value => [value.afterNodeId, value.status])).toEqual([["input", "failed"], ["next", "cancelled"]]);
  expect(state.get(object).inline.map(value => value.message)).toEqual(["Failed"]);
});
