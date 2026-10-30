import { describe, expect, it } from "vitest";
import { runAgentLoop, type AgentLoopPort } from "./loop.ts";

function port(overrides: Partial<AgentLoopPort>): AgentLoopPort {
  return { requestLimit: () => 3, request: async () => ({ reason: "completed", hasTools: false }),
    completed: async () => {}, consume: () => false, limitReached() {}, ...overrides };
}

describe("Agent request and turn boundaries", () => {
  it("tool results continue the turn and steering does not reset its request budget", async () => {
    const indices: number[] = [];
    let limits = 0, completion = 0, steering = true;
    const status = await runAgentLoop(port({
      requestLimit: () => 2,
      async request(index) { indices.push(index); return { reason: "completed", hasTools: true }; },
      consume(boundary) {
        if (boundary === "request" && steering) { steering = false; return true; }
        return false;
      },
      async completed() { completion++; },
      limitReached() { limits++; },
    }), new AbortController().signal);
    expect(status).toBe("limited");
    expect(indices).toEqual([0, 1]);
    expect(limits).toBe(1);
    expect(completion).toBe(0);
  });

  it("a follow-up consumed after the budget boundary starts a fresh turn", async () => {
    const indices: number[] = [];
    let followUp = true;
    const status = await runAgentLoop(port({
      requestLimit: () => 1,
      async request(index) {
        indices.push(index);
        return { reason: "completed", hasTools: indices.length === 1 };
      },
      consume(boundary) {
        if (boundary === "turn" && followUp) { followUp = false; return true; }
        return false;
      },
    }), new AbortController().signal);
    expect(status).toBe("completed");
    expect(indices).toEqual([0, 0]);
  });

  it.each([
    { reason: "cancelled" as const, halt: false, expected: "cancelled" },
    { reason: "failed" as const, halt: true, expected: "failed" },
  ])("$reason with halt=$halt preserves pending input", async ({ reason, halt, expected }) => {
    let consumed = false;
    const status = await runAgentLoop(port({
      async request() { return { reason, hasTools: false, halt }; },
      consume() { consumed = true; return false; },
    }), new AbortController().signal);
    expect(status).toBe(expected);
    expect(consumed).toBe(false);
  });

  it("an ordinary request failure can consume the next turn while preparation failure ends the loop", async () => {
    let requests = 0, followUp = true;
    expect(await runAgentLoop(port({
      async request() { return { reason: ++requests === 1 ? "failed" : "completed", hasTools: false }; },
      consume(boundary) {
        if (boundary === "turn" && followUp) { followUp = false; return true; }
        return false;
      },
    }), new AbortController().signal)).toBe("completed");
    expect(requests).toBe(2);
    let consumed = false;
    await expect(runAgentLoop(port({
      async request() { throw new Error("Context could not be recorded."); },
      consume() { consumed = true; return false; },
    }), new AbortController().signal)).rejects.toThrow("Context could not be recorded.");
    expect(consumed).toBe(false);
  });
});
