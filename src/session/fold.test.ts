import { describe, expect, it } from "vitest";
import { foldWorkbench } from "./fold.ts";
import { attached, created, node, removed } from "./test-nodes.ts";

// Workbench event folding contract: removal clears links in all directions and historical reads use only the supplied path.
describe("Workbench folding", () => {
  it("object removal clears incoming and outgoing links while old paths still restore objects and relationships", () => {
    const path = [
      node("a", null, created("agent-a", "A")),
      node("b", "a", created("agent-b", "B")),
      node("ab", "b", attached("agent-b", "agent-a")),
      node("ba", "ab", attached("agent-a", "agent-b")),
    ];
    const current = foldWorkbench([...path, node("removed", "ba", removed("agent-a"))]);
    expect(current.objects.map(object => object.id)).toEqual(["agent-b"]);
    expect(current.links).toEqual([]);
    expect(foldWorkbench(path).links).toEqual([
      { receiverId: "agent-b", resourceId: "agent-a" }, { receiverId: "agent-a", resourceId: "agent-b" },
    ]);
  });
});
