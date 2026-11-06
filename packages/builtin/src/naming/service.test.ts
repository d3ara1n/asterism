import { describe, expect, it, vi } from "vitest";
import { AutomaticSessionName } from "@asterism-app/builtin-api/contracts";
import { SessionTitleAssigned, type ModelEvent } from "@asterism-app/sdk/contracts";
import type { ModelServices, SessionExecutor } from "@asterism-app/sdk/runtime";
import { sessionSnapshot } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { event, message, node, text } from "../../../../src/session/test-nodes.ts";
import { defaultParadigmConfiguration, resolveParadigmConfiguration } from "../configuration/state.ts";
import { createSessionNaming } from "./service.ts";

function fixture(explicit = false, utility = true) {
  const nodes = [
    node("input", null, message("agent", "Fix login")),
    node("reply", "input", text("agent", "response", 0, "Fixed token refresh", { requestParentId: "input" })),
  ];
  if (explicit) nodes.push(node("name", "reply", event(SessionTitleAssigned.id, { title: "Chosen" })));
  const snapshot = sessionSnapshot(nodeView("s", "Chosen", nodes, nodes.at(-1)!.id));
  const set = vi.fn();
  const session = { id: "s", snapshot: () => snapshot, title: { set }, commit: (work: () => undefined) => work() } as unknown as SessionExecutor;
  const config = structuredClone(defaultParadigmConfiguration);
  if (utility) config.roles.find(role => role.id === "utility")!.overrides.model = "test/model";
  const stream = vi.fn<ModelServices["stream"]>();
  const generate = createSessionNaming({ models: { stream }, roles: () => resolveParadigmConfiguration(config).roles });
  return { snapshot, session, set, stream, generate };
}

const signal = () => new AbortController().signal;
function response(value: string, reason: "stop" | "length" = "stop"): ModelEvent[] {
  return [
    { type: "part.start", part: { kind: "text", id: "title" } },
    { type: "part.delta", partId: "title", delta: value },
    { type: "finish", reason, usage: null },
  ];
}
function emit(events: ModelEvent[]): ModelServices["stream"] {
  return async function* () { yield* events; };
}

// Initial naming has no completed reply to summarize; refined and user-requested naming must retain work actually done.
describe("shared session naming", () => {
  it.each(["initial", "refined", "manual"] as const)("%s generation selects its material and preserves naming intent", async mode => {
    const f = fixture(mode === "manual");
    f.stream.mockImplementation(emit(response('Title: “Fixed login.”')));
    const trigger = mode === "manual" ? null : { level: mode, messageId: "input" };
    await f.generate(f.session, f.snapshot, trigger, signal());
    const prompt = JSON.stringify(f.stream.mock.calls[0]![0].messages);
    expect(prompt).toContain("Fix login");
    if (mode === "initial") expect(prompt).not.toContain("Fixed token refresh");
    else expect(prompt).toContain("Fixed token refresh");
    expect(f.set).toHaveBeenCalledExactlyOnceWith("Fixed login", mode === "manual" ? undefined : {
      contract: { id: AutomaticSessionName.id }, data: { level: mode, messageId: "input", model: "test/model" },
    });
  });

  it("ignores reasoning and unannounced deltas instead of treating them as title text", async () => {
    const f = fixture();
    f.stream.mockImplementation(emit([
      { type: "part.start", part: { kind: "thinking", id: "reasoning" } },
      { type: "part.delta", partId: "reasoning", delta: "Private reasoning" },
      { type: "part.delta", partId: "unknown", delta: "Unannounced" },
      ...response("Login repair"),
    ]));
    await f.generate(f.session, f.snapshot, null, signal());
    expect(f.set).toHaveBeenCalledExactlyOnceWith("Login repair", undefined);
  });

  it.each([
    ["truncated", response("Plausible but unfinished", "length")],
    ["missing finish", response("Unconfirmed").slice(0, -1)],
    ["empty", response("<title> </title>")],
    ["excessive output", response("x".repeat(4001))],
  ] as const)("%s output cannot overwrite an explicit title", async (_name, events) => {
    const f = fixture(true);
    f.stream.mockImplementation(emit([...events]));
    await expect(f.generate(f.session, f.snapshot, null, signal())).rejects.toThrow();
    expect(f.set).not.toHaveBeenCalled();
  });

  it("rejects a session without conversation material instead of asking utility to invent a title", async () => {
    const f = fixture();
    const empty = sessionSnapshot(nodeView("s", "Chosen", [], null));
    await expect(f.generate(f.session, empty, null, signal())).rejects.toThrow("The session has no conversation to name.");
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.set).not.toHaveBeenCalled();
  });

  it("keeps background naming quiet without utility but reports unavailability for a user request", async () => {
    const f = fixture(false, false);
    await f.generate(f.session, f.snapshot, { level: "refined", messageId: "input" }, signal());
    await expect(f.generate(f.session, f.snapshot, null, signal())).rejects.toMatchObject({ code: "unavailable" });
    expect(f.stream).not.toHaveBeenCalled();
    expect(f.set).not.toHaveBeenCalled();
  });
});
