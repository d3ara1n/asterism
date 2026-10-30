import { describe, expect, it } from "vitest";
import { defaultAgents, defaultRoles } from "../configuration/defaults.ts";
import { accumulateUsage, classify, resolveTask } from "./execution.ts";

const configured = () => ({ agents: structuredClone(defaultAgents), roles: structuredClone(defaultRoles) });

describe("Subagent model selection", () => {
  it("uses the default model for an empty selected ModelRole while keeping its thinking level", () => {
    const configuration = configured();
    configuration.roles.find(role => role.id === "default")!.model = "provider/general";
    expect(resolveTask(configuration, { role: "reviewer", model: null }).target).toEqual({ provider: "provider", model: "general", thinking: "high" });
    configuration.roles.find(role => role.id === "heavy")!.model = "provider/review";
    expect(resolveTask(configuration, { role: "reviewer", model: null }).target.model).toBe("review");
  });
  // An explicit selection replaces the role's model and thinking together, so ModelRole state cannot affect it.
  it("uses an explicit model and thinking level without resolving the role's ModelRole", () => {
    const configuration = configured();
    configuration.roles.find(role => role.id === "heavy")!.enabled = false;
    expect(resolveTask(configuration, { role: "reviewer", model: { model: "other/explicit", thinking: "low" } }).target)
      .toEqual({ provider: "other", model: "explicit", thinking: "low" });
    expect(resolveTask(configuration, { role: "reviewer", model: { model: "other/explicit", thinking: null } }).target)
      .toEqual({ provider: "other", model: "explicit" });
  });
  it("reports missing configuration and never substitutes an unavailable AgentRole or ModelRole", () => {
    const configuration = configured();
    expect(() => resolveTask(configuration, { role: "explorer", model: null })).toThrow("no configured model");
    expect(() => resolveTask(configuration, { role: "missing", model: { model: "provider/model", thinking: null } })).toThrow("Agent role missing");
    configuration.roles.find(role => role.id === "fast")!.enabled = false;
    expect(() => resolveTask(configuration, { role: "explorer", model: null })).toThrow("Model role fast");
  });
  it("does not report partial token measurements as known totals", () => {
    const first = { input: 10, output: 4, total: 14, reasoning: null, cacheRead: 0, cacheWrite: null };
    expect(accumulateUsage(first, { input: 5, output: null, total: null, reasoning: 1, cacheRead: 2, cacheWrite: null }, false))
      .toEqual({ input: 15, output: null, total: null, reasoning: null, cacheRead: 2, cacheWrite: null });
  });
});

// An interruption can surface as a loop result, a thrown error, or a failed request; it must decide the outcome in every form.
describe("Subagent outcome classification", () => {
  const failedRequest = { kind: "loop", status: "failed", failure: { code: "network", message: "Aborted" } } as const;
  it("reports the time budget and cancellation regardless of how the interruption surfaced", () => {
    for (const ending of [failedRequest, { kind: "error", error: new Error("Aborted") } as const, { kind: "loop", status: "completed", failure: null } as const]) {
      expect(classify(ending, { kind: "time" })).toMatchObject({ outcome: "partial", code: "budget_exceeded" });
      expect(classify(ending, { kind: "cancelled", reason: new Error("Stop now") })).toMatchObject({ outcome: "cancelled", message: "Stop now" });
    }
  });
  it("maps uninterrupted endings to their own outcomes", () => {
    expect(classify({ kind: "loop", status: "completed", failure: null }, null)).toMatchObject({ outcome: "succeeded", code: null });
    expect(classify({ kind: "loop", status: "limited", failure: null }, null)).toMatchObject({ outcome: "partial", code: "budget_exceeded" });
    expect(classify(failedRequest, null)).toMatchObject({ outcome: "failed", code: "network" });
    expect(classify({ kind: "error", error: new Error("Broken") }, null)).toMatchObject({ outcome: "failed", code: "execution_failed", message: "Broken" });
  });
});
