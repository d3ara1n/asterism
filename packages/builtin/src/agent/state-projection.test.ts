import { describe, expect, it } from "vitest";
import type { ModelCompletion } from "@asterism/sdk/contracts";
import { projectAgentTurnState } from "./state-projection.ts";
import { agentExecutionState } from "./state.ts";
import { sessionView } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { attached, call, message, node, text, thinking } from "../../../../src/session/test-nodes.ts";
import type { NewNode } from "../../../../src/shared/session.ts";

const completion = (finishReason = "stop"): ModelCompletion => ({
  finishReason, rawFinishReason: finishReason === "stop" ? "end_turn" : null, usage: null, providerResponseId: null,
});
const answer = (responseId = "r1") => text("a", responseId, 0, "Done", { completion: completion() });
function project(values: NewNode[], running = false, interruptions: readonly (string | null)[] = []) {
  const path = values.map((value, index) => node(String(index), index ? String(index - 1) : null, value));
  return agentExecutionState(projectAgentTurnState(sessionView(nodeView("s", "", path, path.at(-1)?.id ?? null)), "a", interruptions), running);
}

// Execution-state projection; verifies domain decisions only, without simulating components or a transient state bus.
describe("Agent execution-state projection", () => {
  it("Waits for input when there is no user input for this agent; accepted input without a reply can resume, while an active run prioritizes the stop action", () => {
    expect(project([message("b", "For B")], false, ["0"])).toBe("empty");
    expect(project([message("a", "Go")])).toBe("incomplete");
    expect(project([message("a", "Go")], true)).toBe("running");
    expect(project([message("a", "Go"), answer()], true)).toBe("running");
  });

  it("Restores normal completion from persistent history; other agents and resource events do not reopen the resume action", () => {
    expect(project([
      message("a", "Go"), answer(), message("b", "For B"), attached("a", "dir"),
    ])).toBe("completed");
  });

  it("New input and history rewinding redetermine pending work without reusing later normal completion", () => {
    const values = [message("a", "Go"), thinking("a", "r1", 0), text("a", "r1", 1, "Done", { completion: completion() })];
    expect(project(values)).toBe("completed");
    expect(project(values.slice(0, 2))).toBe("incomplete");
    expect(project([])).toBe("empty");
    expect(project([...values, message("a", "Next")])).toBe("incomplete");
  });

  it.each([
    ["missing response terminal state", text("a", "r1", 0, "Ended block")],
    ["output reaches the length limit", text("a", "r1", 0, "Truncated", { completion: completion("length") })],
    ["incomplete body block", text("a", "r1", 0, "Partial", { complete: false, completion: completion() })],
  ])("%s is not considered normally completed merely because body text exists", (_reason, block) => {
    expect(project([message("a", "Go"), block])).toBe("incomplete");
  });

  it("The final response block may be saved before tool outcomes; even a completed tool batch still requires another model reply", () => {
    const values = [
      message("a", "Go"),
      text("a", "r1", 2, "I will use these results", { completion: completion() }),
      call("a", "r1", 1, "c2"),
      call("a", "r1", 0, "c1"),
    ];
    expect(project(values.slice(0, 2))).toBe("incomplete");
    expect(project(values)).toBe("incomplete");
    expect(project([...values, answer("r2")])).toBe("completed");
  });

  // A failure without new output cannot reuse an earlier success; in-memory interruption applies only to its path, and subsequent responses redetermine state.
  it("Temporary interruption overrides an earlier terminal state, while subsequent success and restart recovery do not reuse the interruption", () => {
    const values = [message("a", "Go"), answer(), attached("a", "dir")];
    expect(project(values, false, ["1"])).toBe("incomplete");
    expect(project([...values, answer("r2")], false, ["1"])).toBe("completed");
    expect(project(values, false, ["other-branch"])).toBe("completed");
    expect(project(values)).toBe("completed");
  });
});
