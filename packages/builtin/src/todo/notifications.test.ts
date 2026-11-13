import { describe, expect, it } from "vitest";
import { Agent } from "@asterism-app/builtin-api/contracts";
import type { ResourceSnapshot } from "@asterism-app/sdk/contracts";
import { TodoListResource } from "./contract.ts";
import { notificationRoutes } from "./notifications.ts";

function resource(sessionId: string, id: string, kind = Agent.kind, title = "Worker"): ResourceSnapshot {
  return { ref: { sessionId, id, kind }, title, data: {} };
}

describe("Todo notification routing", () => {
  it("deduplicates repeated exposure paths, excludes the acting Agent, and keeps same-name Agents in different sessions", () => {
    const sourceA = resource("a", "list", TodoListResource.kind), sourceB = resource("b", "list", TodoListResource.kind);
    const actor = resource("a", "actor"), first = resource("a", "worker"), second = resource("b", "worker");
    const entrances = [
      { source: sourceA, recipients: [actor, first, resource("a", "note", "asterism.builtin/note")] },
      { source: sourceB, recipients: [first, second, { ...actor, title: "Renamed" }] },
    ];
    expect(notificationRoutes(entrances, { kind: "agent", ref: actor.ref, title: "Old title" })).toEqual([
      { source: sourceA, recipient: first }, { source: sourceB, recipient: second },
    ]);
    // User-originated changes have no Agent to exclude.
    expect(notificationRoutes(entrances, { kind: "user" }).map(route => route.recipient.ref)).toEqual([actor.ref, first.ref, second.ref]);
  });

  it("uses an available entrance as the event source without requiring exposure through every entrance", () => {
    const empty = resource("a", "empty", TodoListResource.kind), connected = resource("b", "connected", TodoListResource.kind);
    const recipient = resource("b", "reviewer");
    expect(notificationRoutes([
      { source: empty, recipients: [] }, { source: connected, recipients: [recipient, recipient] },
    ], { kind: "user" })).toEqual([{ source: connected, recipient }]);
  });
});
