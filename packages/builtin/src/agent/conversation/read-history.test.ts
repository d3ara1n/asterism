import { describe, expect, it } from "vitest";
import type { RecordQuery, SessionRecord, ToolOutcome } from "@asterism-app/sdk/contracts";
import type { RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import { ContextSummary, ToolExecution } from "@asterism-app/builtin-api/contracts";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { agentSource, call, event, message, node, text } from "../../../../../src/session/test-nodes";
import { ConversationHistoryWindow } from "./history-window";
import { readConversation } from "./read-history";
import { conversationTimeline, withLive } from "./timeline";

const completion = { finishReason: "stop", rawFinishReason: null, providerResponseId: null,
  usage: { input: 100, output: 10, total: 110, cacheRead: 50, cacheWrite: null, reasoning: null } };
function fixture(nodes: ReturnType<typeof node>[]) {
  const snapshot = sessionSnapshot(nodeView("s", "", nodes, nodes.at(-1)?.id ?? null));
  const reads: string[] = [];
  const remote = { ...snapshot, records: { ...snapshot.records, async all(query: RecordQuery) {
    const records = snapshot.records.all(query);
    reads.push(...records.map(record => record.id));
    return records;
  } } } as unknown as RendererSessionSnapshot;
  return { remote, reads };
}

describe("Conversation display reads", () => {
  // Generic operations and other Agents may carry large bodies; positional feedback still belongs after those records.
  it("reads only this Agent's conversation bodies while preserving unrelated feedback anchors and turn measurements", async () => {
    const tool = call("a", "work", 0, "c", { outcome: null });
    const outcome = { kind: "succeeded", data: { entries: ["main.ts"] }, model: [{ kind: "text", text: "main.ts" }] } satisfies ToolOutcome;
    const { remote, reads } = fixture([
      node("input", null, message("a", "Inspect")),
      node("operation", "input", event(ToolExecution.id, { input: (tool.data as { block: SessionRecord["data"] }).block, output: outcome }, { source: agentSource("a") })),
      node("unrelated", "operation", event("example/huge-result", { body: "Not needed by this conversation" })),
      node("other", "unrelated", text("b", "other", 0, "Another Agent's private response")),
      node("reply", "other", text("a", "final", 0, "Done", { completion })),
    ]);
    const result = await readConversation(remote, "a", new ConversationHistoryWindow());
    expect(new Set(reads)).toEqual(new Set(["input", "operation", "reply"]));
    const timeline = withLive(conversationTimeline(result.projection, false, [
      { id: "notice", afterNodeId: "unrelated", origin: "software", code: "info", level: "warning", message: "At this position" },
    ], [{ id: "compressing", afterNodeId: "other", status: "running" }]), []);
    expect(timeline.map(item => item.id)).toEqual(["input", "operation", "notice", "compressing", "reply", "turn-metrics:input"]);
    expect(timeline.at(-1)).toMatchObject({ incomplete: false, replyMarkdown: "Done", metrics: { count: 2, usage: { input: { value: 100 } } } });
    expect(timeline.find(item => item.id === "operation")).toMatchObject({ kind: "toolcall", outcome });
  });

  // A compression boundary can point at a host record with no display body; excluding it must not invalidate the range.
  it("keeps a metadata-only compression boundary without reading its body or resurrecting earlier output", async () => {
    const { remote, reads } = fixture([
      node("input", null, message("a", "Work")),
      node("old", "input", text("a", "old", 0, "Earlier progress")),
      node("kept", "old", event("example/checkpoint", { large: "Unused checkpoint data" })),
      node("reply", "kept", text("a", "final", 0, "Retained answer", { completion })),
      node("summary", "reply", event(ContextSummary.id, { summary: "Compacted", keptFrom: "kept", model: "p/m", tokensBefore: 1000, completion }, { source: agentSource("a") })),
    ]);
    const result = await readConversation(remote, "a", new ConversationHistoryWindow());
    expect(reads).not.toContain("kept");
    const timeline = withLive(conversationTimeline(result.projection, false), []);
    expect(timeline.map(item => item.id)).toEqual(["compression-boundary:summary", "reply", "turn-metrics:input"]);
    expect(timeline.at(-1)).toMatchObject({ metrics: { count: 2 }, replyMarkdown: "Retained answer" });
  });

  // Provider continuations and completion extensions can duplicate entire requests; only user-visible text and aggregate measurements survive the read.
  it("releases provider-only payloads after projection and recomposes live feedback without carrying original bodies", async () => {
    const continuation = "provider-continuation:" + "x".repeat(100_000);
    const diagnostics = "request-diagnostics:" + "y".repeat(100_000);
    const { remote } = fixture([
      node("input", null, message("a", "Question")),
      node("reply", "input", text("a", "final", 0, "Answer", { continuation,
        completion: { ...completion, extensions: [{ contract: { id: "example/diagnostics" }, data: { request: diagnostics } }] } })),
    ]);
    const result = await readConversation(remote, "a", new ConversationHistoryWindow());
    const retained = JSON.stringify(result);
    expect(retained).not.toContain(continuation);
    expect(retained).not.toContain(diagnostics);
    const running = withLive(conversationTimeline(result.projection, true), []);
    expect(running.map(item => item.id)).toEqual(["input", "reply"]);
    const settled = withLive(conversationTimeline(result.projection, false, [
      { id: "late", afterNodeId: "reply", origin: "software", code: "info", level: "warning", message: "New feedback" },
    ]), []);
    expect(settled.map(item => item.id)).toEqual(["input", "reply", "late", "turn-metrics:input"]);
    expect(settled.at(-1)).toMatchObject({ replyMarkdown: "Answer", metrics: { count: 1, usage: { input: { value: 100 } } } });
  });
});
