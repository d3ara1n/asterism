import { expect, test } from "vitest";
import type { PluginContext } from "@asterism-app/sdk/runtime";
import { defineAgentContextTransform } from "@asterism-app/builtin-api/runtime";
import { createWorkProjection } from "./work-projection.ts";
import { sessionView } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { call, message, node } from "../../../../src/session/test-nodes.ts";

const nodes = [
  node("start", null, message("a", "first")),
  node("check", "start", call("a", "first", 0, "check-call", { name: "diagnostic", requestParentId: "start" })),
  node("steer", "check", message("a", "steer", false)),
  node("next", "steer", message("a", "next turn")),
];
const snapshot = (tip: string) => sessionView(nodeView("s", "", nodes.slice(0, nodes.findIndex(n => n.id === tip) + 1), tip));
function fixture() {
  const signal = new AbortController();
  const sessions = {};
  const owner = (id: string) => ({ id, sessions, lifetime: { signal: signal.signal } }) as PluginContext;
  return { signal, owner, work: createWorkProjection(owner("builtin")) };
}

test("an independent transform omits old diagnostics and a later transform annotates that projection", () => {
  const { signal, owner, work } = fixture();
  defineAgentContextTransform({ id: "omit", transform: (units, request) => units.filter(unit => unit.turn === request.turn ||
    !unit.items.some(({ item }) => item.kind === "result" && item.name === "diagnostic")) }).setup(owner("one"));
  defineAgentContextTransform({ id: "annotate", transform(units, request) {
    if (units.some(unit => unit.items.some(({ item }) => item.kind === "result"))) return units;
    return [...units, { turn: request.turn, items: [{ item: { kind: "context", parts: [{ kind: "text", text: "No pending diagnostics" }] } }] }];
  } }).setup(owner("two"));
  expect(work(snapshot("steer"), "a").map(item => item.kind)).toEqual(["input", "output", "result", "input"]);
  const projected = work(snapshot("next"), "a");
  expect(projected.map(item => item.kind)).toEqual(["input", "input", "input", "context"]);
  expect(projected.at(-1)).toEqual({ kind: "context", parts: [{ kind: "text", text: "No pending diagnostics" }] });
  expect(work(snapshot("steer"), "a", true).map(item => item.kind)).toEqual(["input", "input", "context"]);
  signal.abort();
  expect(work(snapshot("next"), "a").map(item => item.kind)).toEqual(["input", "output", "result", "input", "input"]);
});

test("a transform cannot leave behind an unpaired historical tool call", () => {
  const { owner, work } = fixture();
  defineAgentContextTransform({ id: "split", transform: units => units.map(unit => ({ ...unit, items: unit.items.filter(({ item }) => item.kind !== "result") })) }).setup(owner("broken"));
  expect(() => work(snapshot("next"), "a")).toThrow("must remain paired");
});
