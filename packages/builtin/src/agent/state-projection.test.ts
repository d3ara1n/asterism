import { describe, expect, it } from "vitest";
import type { ModelCompletion } from "@asterism-app/sdk/contracts";
import { projectAgentTurnState } from "./state-projection.ts";
import { sessionView } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { attached, call, message, node, text, thinking } from "../../../../src/session/test-nodes.ts";
import type { NewNode } from "../../../../src/shared/session.ts";

const completion = (finishReason = "stop"): ModelCompletion => ({
  finishReason, rawFinishReason: finishReason === "stop" ? "end_turn" : null, usage: null, providerResponseId: null,
});
const answer = (responseId = "r1") => text("a", responseId, 0, "Done", { completion: completion() });
function project(values: NewNode[]) {
  const path = values.map((value, index) => node(String(index), index ? String(index - 1) : null, value));
  return projectAgentTurnState(sessionView(nodeView("s", "", path, path.at(-1)?.id ?? null)), "a");
}

describe("Agent turn state on the current path", () => {
  it("Waits for input when this Agent has none and can continue accepted input without a reply", () => {
    expect(project([message("b", "For B")])).toBe("empty");
    expect(project([message("a", "Go")])).toBe("incomplete");
  });

  it("Restores normal completion from persistent history; another agent's inputs and link notices do not reopen the resume action", () => {
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
    ["cancelled generation with closed text", text("a", "r1", 0, "Closed text", { completion: { ...completion(), termination: { reason: "cancelled" } } })],
    ["incomplete body block", text("a", "r1", 0, "Partial", { complete: false, completion: completion() })],
    ["thinking without a reply", thinking("a", "r1", 0, "Reasoning", { completion: completion() })],
    ["blank reply text", text("a", "r1", 0, " \n", { completion: completion() })],
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

  it("A completed reply stays valid until another input needs an answer or a later attempt leaves an incomplete response", () => {
    const values = [message("a", "Go"), answer()];
    const steer = message("a", "One more thing", false);
    const partial = text("a", "r2", 0, "Starting", { complete: false });
    expect(project([...values, steer])).toBe("incomplete");
    expect(project([...values, steer, answer("r2")])).toBe("completed");
    expect(project([...values, partial])).toBe("incomplete");
  });
});
