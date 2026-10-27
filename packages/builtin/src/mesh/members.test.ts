import { describe, expect, it } from "vitest";
import { reconcileMembers, type Membership } from "./members.ts";

const source = (agent: string, mesh = "mesh-a", channelId = "default", title = "Atlas"): Membership => ({
  ref: { sessionId: agent, id: agent, kind: "agent" }, mesh: { sessionId: agent, id: mesh, kind: "mesh" },
  channelId, title, type: "worker", description: mesh,
});

describe("Mesh channel addresses", () => {
  it("deduplicates multiple routes to one Agent and retains distinct descriptions", () => {
    const first = reconcileMembers([], [source("a"), source("a", "mesh-b"), source("b")]);
    expect(first.members.map(member => member.profile)).toEqual([
      { title: "Atlas", id: 0, type: "worker", descriptions: ["mesh-a", "mesh-b"] },
      { title: "Atlas", id: 1, type: "worker", descriptions: ["mesh-a"] },
    ]);
    const removedRoute = reconcileMembers(first.allocations, [source("a", "mesh-b"), source("b")]);
    expect(removedRoute.members.map(member => member.profile.id)).toEqual([0, 1]);
  });

  it("never renumbers surviving Agents or reuses a departed ID while the name remains occupied", () => {
    const first = reconcileMembers([], [source("a"), source("b")]);
    const second = reconcileMembers(first.allocations, [source("b"), source("c")]);
    expect(second.members.map(member => [member.ref.id, member.profile.id])).toEqual([["b", 1], ["c", 2]]);
    const reordered = reconcileMembers(second.allocations, [source("c"), source("b"), source("a")]);
    expect(reordered.members.map(member => [member.ref.id, member.profile.id])).toEqual([["c", 2], ["b", 1], ["a", 3]]);
  });

  it("resets only empty name groups and keeps channel and title namespaces independent", () => {
    const first = reconcileMembers([], [source("a"), source("b"), source("c", "mesh-c", "other"), source("d", "mesh-d", "default", "Nova")]);
    expect(first.members.map(member => member.profile.id)).toEqual([0, 1, 0, 0]);
    const departed = reconcileMembers(first.allocations, [source("c", "mesh-c", "other"), source("d", "mesh-d", "default", "Nova")]);
    const joined = reconcileMembers(departed.allocations, [source("new"), source("c", "mesh-c", "other"), source("d", "mesh-d", "default", "Nova")]);
    expect(joined.members.map(member => member.profile.id)).toEqual([0, 0, 0]);
  });

  it("preserves saved allocations when reconstructing members after restart", () => {
    const first = reconcileMembers([], [source("a"), source("b")]);
    const departed = reconcileMembers(first.allocations, [source("b")]);
    const restored = reconcileMembers(JSON.parse(JSON.stringify(departed.allocations)), [source("b"), source("c")]);
    expect(restored.members.map(member => member.profile.id)).toEqual([1, 2]);
  });
});
