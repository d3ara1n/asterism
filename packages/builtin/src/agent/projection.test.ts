import { describe, expect, it } from "vitest";
import { projectForAgent } from "./projection.ts";
import { sessionView } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { attached, call, event, message, node, text, thinking } from "../../../../src/session/test-nodes.ts";
import type { NewNode, SessionNode } from "../../../../src/shared/session.ts";
import { projectPeekRecords } from "./peek/snapshot.ts";
import { contextInsight } from "./context/insight.ts";
import { serializeForSummary } from "./compression-prompt.ts";
import { sessionSnapshot } from "../../../../src/plugins/records.ts";

function records(...values: NewNode[]): SessionNode[] {
  return values.map((value, index) => node(String(index), index ? String(index - 1) : null, value));
}
const project = (path: SessionNode[], agent = "a") => projectForAgent(sessionView(nodeView("s", "", path, path.at(-1)?.id ?? null)), agent);

// Expectations follow the timeline projection contract; storage, path selection, and generic envelope conversion are protected at their own boundaries.
describe("Agent model projection", () => {
  // Addresses allow relay types; identity and body are escaped separately, and the UI and history investigation consume the same saved source.
  it("Generates envelopes for relay resources and named agents only in model projection, while display preserves original text and source", () => {
    const sender = { kind: "agent" as const, resource: { sessionId: "s", id: "relay", kind: "example/relay" }, name: '审查 "A" & B' };
    const body = "  <agent-message>raw & text</agent-message>\n";
    const path = records(message("a", "User"), message("a", body, false, sender));
    const snapshot = sessionSnapshot(nodeView("s", "", path, "1"));
    const projected = project(path);
    expect(projected[1]).toEqual({ kind: "input", parts: [
      { kind: "text", text: '<agent-message sender-id="relay" sender-name="审查 &quot;A&quot; &amp; B">' },
      { kind: "text", text: "  &lt;agent-message&gt;raw &amp; text&lt;/agent-message&gt;\n" },
      { kind: "text", text: "</agent-message>" },
    ] });
    expect(projectPeekRecords(snapshot, "a", false).at(-1)).toMatchObject({ kind: "agent", text: expect.stringContaining('sender-id="relay"') });
    expect(contextInsight(snapshot, "a").conversation.characters).toMatchObject({ user: 4, agentMessage: expect.any(Number) });
    expect(contextInsight(snapshot, "a").conversation.characters.agentMessage).toBeGreaterThan(body.length);
    expect(serializeForSummary(projected)).toContain('[Input]: <agent-message sender-id="relay"');
    expect(path[1]!.data).toMatchObject({ sender, parts: [{ text: body }] });
  });

  // After public payloads pass through Execution decoding and reconstruction, summaries and full text must remain independent and cannot be overwritten by display choices.
  it("Historical thinking preserves separate full text, summaries, and continuation data", () => {
    const continuation = { openai: { reasoningEncryptedContent: "cipher" } };
    const path = records(
      message("a", "go"),
      thinking("a", "r", 0, "Full thought", { summary: "Summary", continuation, requestParentId: "0" }),
      text("a", "r", 1, "Answer", { requestParentId: "0" }),
    );
    expect(project(path)[1]).toMatchObject({ kind: "output", parts: [
      { kind: "thinking", text: "Full thought", summary: "Summary", continuation },
      { kind: "text", text: "Answer" },
    ] });
  });
  it("Places events after the request starting point after the response, preserving the sent prefix for the next request", () => {
    const path = records(message("a", "go"), attached("a", "before"));
    const sent = project(path);
    path.push(node("during", "1", attached("a", "during")));
    path.push(node("tool", "during", call("a", "r1", 0, "c1", { requestParentId: "1" })));
    const next = project(path);
    expect(next.slice(0, sent.length)).toEqual(sent);
    expect(next.slice(sent.length).map(item => item.kind)).toEqual(["output", "result", "context"]);
    path.push(node("later", "tool", attached("a", "later")));
    path.push(node("answer", "later", text("a", "r2", 0, "answer", { requestParentId: "tool" })));
    const final = project(path);
    expect(final.slice(0, next.length)).toEqual(next);
    expect(final.slice(next.length).map(item => item.kind)).toEqual(["output", "context"]);
    expect(project(path.slice(0, 3)).at(-1)).toMatchObject({ kind: "context", parts: [{ kind: "text", text: "during attached" }] });
  });

  it("The request starting point may belong to another agent; each agent projects only its own records and model-visible events", () => {
    const path = records(
      message("a", "for A"), message("b", "for B"),
      event("resource_attached", { id: "shared" }, { model: "shared attached", recipient: null }),
      event("example.plugin/private", { title: "not model content" }),
      text("a", "ra", 0, "A", { requestParentId: "1" }),
      text("b", "rb", 0, "B", { requestParentId: "1" }),
    );
    for (const agent of ["a", "b"]) {
      const items = project(path, agent);
      expect(items.map(item => item.kind)).toEqual(["input", "output", "context"]);
      expect(items[0]).toMatchObject({ parts: [{ text: agent === "a" ? "for A" : "for B" }] });
      expect(items[1]).toMatchObject({ parts: [{ text: agent.toUpperCase() }] });
    }
  });

  it("Groups responses by ordinal, followed by tool results; intervening events are deferred and other agents' output remains invisible", () => {
    const path = records(
      message("a", "go"),
      call("a", "r1", 1, "c2", { requestParentId: "0" }),
      attached("a", "dir"), text("b", "rb", 0, "other agent"),
      call("a", "r1", 0, "c1", { requestParentId: "0" }),
    );
    expect(project(path).map(item => item.kind === "output"
      ? item.parts.map(part => part.kind === "toolcall" ? part.callId : part.kind).join()
      : item.kind === "result" ? item.callId : item.kind)).toEqual(["input", "c1,c2", "c1", "c2", "context"]);
  });

  it("Projects only calls on the viewed path, with a corresponding result for every call", () => {
    const path = records(message("a", "go"), call("a", "r1", 0, "c1"), call("a", "r1", 1, "c2"));
    const items = project(path.slice(0, 2));
    expect(items.filter(item => item.kind === "result").map(item => item.callId)).toEqual(["c1"]);
  });

  it("Trailing thinking does not end continuation output", () => {
    expect(project(records(message("a", "go"), thinking("a", "r1", 0, "reasoning"))).map(item => item.kind)).toEqual(["input"]);
    // When body filling is interrupted, skip incomplete blocks first, then remove the trailing thinking exposed by that omission.
    expect(project(records(message("a", "go"), thinking("a", "r1", 0, "reasoning"),
      text("a", "r1", 1, "partial", { complete: false }))).map(item => item.kind)).toEqual(["input"]);
  });
});
