import { afterEach, describe, expect, it } from "vitest";
import { agentUI } from "./renderer.ts";

const scopes: AbortController[] = [];
const scope = () => { const value = new AbortController(); scopes.push(value); return value; };
afterEach(() => { for (const controller of scopes.splice(0)) controller.abort(); });
const Component = () => null;

describe("Public Agent UI registration", () => {
  // Public API contract: duplicate identities must fail explicitly, and old cleanup must not remove a new registration with the same name.
  it("preserves registration order and releases by registration instance without overwriting contributions with the same name", () => {
    const first = scope(), second = scope();
    const remove = agentUI.register({ id: "example.ask/question", Component }, first);
    expect(() => agentUI.register({ id: "example.ask/question", Component }, second)).toThrow("Duplicate Agent UI");
    agentUI.register({ id: "example.todo/list", Component }, second);
    expect(agentUI.getSnapshot().map(entry => entry.id)).toEqual(["example.ask/question", "example.todo/list"]);
    remove();
    agentUI.register({ id: "example.ask/question", Component }, second);
    remove();
    first.abort();
    expect(agentUI.getSnapshot().map(entry => entry.id)).toEqual(["example.todo/list", "example.ask/question"]);
    second.abort();
    expect(agentUI.getSnapshot()).toEqual([]);
  });

  // prepare failure/timeout triggers cleanup through signal; late initialization must not reattach the UI.
  it("cancellation releases contributions and notifies subscribers, and canceled scopes reject registration", () => {
    const controller = scope();
    let observed = 0;
    const stop = agentUI.subscribe(() => { observed = agentUI.getSnapshot().length; });
    try {
      agentUI.register({ id: "example.ask/question", Component }, controller);
      expect(observed).toBe(1);
      controller.abort();
      expect(observed).toBe(0);
      expect(() => agentUI.register({ id: "example.ask/late", Component }, controller)).toThrow();
      expect(agentUI.getSnapshot()).toEqual([]);
    } finally { stop(); }
  });
});
