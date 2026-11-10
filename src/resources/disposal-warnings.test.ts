import { expect, it } from "vitest";
import type { ResourceDisposalWarning } from "@asterism-app/sdk/runtime";
import type { ResourceBackend } from "./contract.ts";
import { ResourceRegistry } from "./registry.ts";

function backend(kind: string, warnings: ResourceDisposalWarning[]): ResourceBackend {
  return {
    kind, disposalWarnings: () => warnings,
    project: () => { throw new Error("Warning discovery does not project saved resources."); },
    inspect: async () => null, context: async () => [],
  };
}

const terminal = { resource: { sessionId: "first", id: "terminal", kind: "test/terminal" }, warning: "Running shell" };
const pool = { resource: { sessionId: "first", id: "pool", kind: "test/pool" }, warning: "Running tasks" };
const elsewhere = { resource: { sessionId: "second", id: "other-terminal", kind: "test/terminal" }, warning: "Other shell" };
const resources = new ResourceRegistry([
  backend("test/terminal", [terminal, elsewhere]), backend("test/pool", [pool]),
]);

it("selects only live warnings in the affected session across resource backends", () => {
  expect(resources.disposalWarnings({ sessionId: "first" })).toEqual([terminal, pool]);
  expect(resources.disposalWarnings({ sessionId: "second" })).toEqual([elsewhere]);
});

it("limits resource-removal warnings to both the session and the selected identities", () => {
  expect(resources.disposalWarnings({ sessionId: "first", objectIds: ["terminal", "other-terminal", "cold-resource"] }))
    .toEqual([terminal]);
  expect(resources.disposalWarnings({ sessionId: "first", objectIds: [] })).toEqual([]);
});
