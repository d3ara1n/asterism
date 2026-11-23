import { describe, expect, it } from "vitest";
import { sessionSnapshot } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { message, node, text } from "../../../../src/session/test-nodes.ts";
import type { NewNode, SessionNode } from "../../../../src/shared/session.ts";
import { newUserInput } from "./input-usage.ts";

function timeline(values: NewNode[]) {
  const path: SessionNode[] = [];
  for (const value of values) path.push(node(String(path.length + 1), path.at(-1)?.id ?? null, value));
  return { path, view: () => sessionSnapshot(nodeView("s", "", path, path.at(-1)?.id ?? null)) };
}
const agent = { kind: "agent" as const, resource: { sessionId: "s", id: "b", kind: "asterism.builtin/agent" }, name: "B" };

describe("Newly delivered user input", () => {
  // Counting every projected message would repeat a reference on every later request of the conversation.
  it("takes only input after the Agent's latest response when no request of the run has declared yet", () => {
    const t = timeline([message("a", "old [x](skill:x)"), text("a", "r1", 0, "answer"), message("a", "new [y](skill:y)"), message("a", "steer", false)]);
    expect(newUserInput(t.view(), "a", undefined)).toEqual({ texts: ["new [y](skill:y)", "steer"], mark: 4 });
  });

  // Within one run the mark advances past what an earlier request declared, even before that request wrote a response.
  it("continues from the run's mark and yields nothing when no input arrived", () => {
    const t = timeline([message("a", "first")]);
    const first = newUserInput(t.view(), "a", undefined);
    expect(first).toEqual({ texts: ["first"], mark: 1 });
    expect(newUserInput(t.view(), "a", first.mark)).toEqual({ texts: [], mark: 1 });
    t.path.push(node("2", "1", message("a", "later", false)));
    expect(newUserInput(t.view(), "a", first.mark)).toEqual({ texts: ["later"], mark: 2 });
  });

  it("advances past Agent messages without taking their text and ignores other Agents' inputs", () => {
    const t = timeline([message("a", "from agent [z](skill:z)", true, agent), message("other", "elsewhere"), message("a", "user", false)]);
    expect(newUserInput(t.view(), "a", undefined)).toEqual({ texts: ["user"], mark: 3 });
  });

  // Paging must not stop at a page boundary while older pages still hold undeclared input.
  it("collects input spanning several record pages in order", () => {
    const t = timeline(Array.from({ length: 70 }, (_, index) => message("a", `m${index}`, index === 0)));
    const result = newUserInput(t.view(), "a", undefined);
    expect(result.texts).toHaveLength(70);
    expect([result.texts[0], result.texts[69], result.mark]).toEqual(["m0", "m69", 70]);
  });
});
