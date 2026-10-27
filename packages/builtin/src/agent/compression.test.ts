import { describe, expect, it } from "vitest";
import { ContextSummary, Execution } from "@asterism-app/builtin-api/contracts";
import { projectAgentContext, projectForAgent, contextMessages } from "./projection.ts";
import { estimateContext, planCompression } from "./compression.ts";
import { serializeForSummary, summaryPrompt } from "./compression-prompt.ts";
import { sessionView } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { agentSource, attached, call, event, message, node, text, thinking } from "../../../../src/session/test-nodes.ts";
import type { NewNode, SessionNode } from "../../../../src/shared/session.ts";

const completion = { usage: { input: 190_000, output: 10, total: 190_010, cacheRead: 150_000, cacheWrite: 0, reasoning: 0 },
  finishReason: "stop", rawFinishReason: null, providerResponseId: null };
const checkpoint = (keptFrom: string, summary = "Earlier goal", agent = "a"): NewNode =>
  event(ContextSummary.id, { summary, keptFrom, model: "p/m", tokensBefore: 190_010, completion }, { source: agentSource(agent) });
const view = (path: SessionNode[]) => sessionView(nodeView("s", "", path, path.at(-1)?.id ?? null));
const context = (path: SessionNode[]) => projectAgentContext(view(path), "a");
function pathOf(...values: NewNode[]): SessionNode[] {
  return values.map((value, index) => node(String(index), index ? String(index - 1) : null, value));
}
function append(path: SessionNode[], value: NewNode) {
  path.push(node(String(path.length), path.at(-1)?.id ?? null, value));
}

// Compression replaces only the prefix; original text, tool pairing, branches, and request starting points remain unchanged.
describe("Context compression boundaries", () => {
  it("Preserves recent original text, native data, and complete tool batches without losing interleaved events", () => {
    const path = pathOf(message("a", "Old goal"), text("a", "old", 0, "Old answer", { requestParentId: "0" }),
      message("a", "Recent request" + "r".repeat(80_000)),
      attached("a", "during"),
      thinking("a", "r", 0, "Private thought", { requestParentId: "2", continuation: { anthropic: { signature: "signature" } } }),
      call("a", "r", 1, "c1", { requestParentId: "2" }),
      attached("a", "between"), call("a", "r", 2, "c2", { requestParentId: "2" }));
    const original = structuredClone(path), full = projectForAgent(view(path), "a");
    const plan = planCompression(context(path))!;
    expect(plan.keptFrom).toBe("2");
    expect(plan.messages).toEqual(full.slice(0, 2));
    append(path, checkpoint(plan.keptFrom));
    const projected = projectForAgent(view(path), "a");
    expect(projected.slice(1)).toEqual(full.slice(2));
    expect(projected.slice(1).map(item => item.kind)).toEqual(["input", "output", "result", "result", "context", "context"]);
    expect(path.slice(0, original.length)).toEqual(original);
    // Continuing from any node before a summary does not consume that later summary prematurely; another agent's summary does not replace this agent's context.
    expect(projectForAgent(view(path.slice(0, -1)), "a")).toEqual(full);
    append(path, checkpoint("2", "Other agent summary", "b"));
    expect(projectForAgent(view(path), "a")).toEqual(projected);
  });

  it("An oversized turn can retain content starting at a complete response, and a request starting point within the summarized prefix remains valid", () => {
    const path = pathOf(message("a", "Long-running request"),
      call("a", "r1", 0, "old-tool", { requestParentId: "0" }),
      attached("a", "during-r2"),
      call("a", "r2", 0, "new-tool", { requestParentId: "1", outcome: { kind: "succeeded", data: null,
        model: [{ kind: "text", text: "R".repeat(90_000) }] } }));
    const before = projectForAgent(view(path), "a");
    const plan = planCompression(context(path))!;
    expect(plan.keptFrom).toBe("2"); // Intervening events occur earlier on the physical path and must also be retained.
    append(path, checkpoint(plan.keptFrom));
    expect(projectForAgent(view(path), "a").slice(1)).toEqual(before.slice(3));
  });

  it("Repeated compression carries forward the previous summary and surviving original text without resummarizing the replaced prefix or stacking summaries", () => {
    const path = pathOf(message("a", "Ancient detail"), text("a", "r0", 0, "Ancient answer", { requestParentId: "0" }),
      message("a", "Previously retained" + "r".repeat(80_000)), text("a", "r1", 0, "Recent answer", { requestParentId: "2" }));
    append(path, checkpoint("2", "Persistent decision"));
    append(path, message("a", "Newest request" + "n".repeat(80_000)));
    append(path, text("a", "r2", 0, "Newest answer", { requestParentId: "5" }));
    const before = contextMessages(context(path));
    const plan = planCompression(context(path))!;
    expect(plan.keptFrom).toBe("5");
    expect(plan.previousSummary).toBe("Persistent decision");
    const prompt = summaryPrompt(plan);
    expect(prompt).toContain("Previously retained");
    expect(prompt).not.toContain("Ancient detail");
    expect(prompt).not.toContain("Newest request");
    append(path, checkpoint(plan.keptFrom, "Merged decision"));
    expect(projectForAgent(view(path), "a").slice(1)).toEqual(before.slice(3));
  });

  it("Explicitly rejects corrupt boundaries instead of silently losing content when a boundary falls within a tool response", () => {
    const path = pathOf(message("a", "go"), call("a", "r", 0, "c1", { requestParentId: "0" }),
      call("a", "r", 1, "c2", { requestParentId: "0" }), checkpoint("2"));
    expect(() => context(path)).toThrow("splits a response");
    path[path.length - 1] = node("3", "2", checkpoint("missing"));
    expect(() => context(path)).toThrow("not a preceding record");
  });

  it("Reported input includes cached tokens and is counted once; new tool results enter the budget, and old anchors are not reused after compression or a model switch", () => {
    const path = pathOf(message("a", "Input"),
      call("a", "r", 0, "c", { requestParentId: "0", completion, outcome: { kind: "succeeded", data: null,
        model: [{ kind: "text", text: "result".repeat(4000) }] } }));
    const record = path[1]!;
    const data = Execution.schema.parse(record.data);
    if (data.type !== "block") throw new Error("Expected a block");
    record.data = { ...data, block: { ...data.block, source: { ...data.block.source, model: "p/m:high" } } };
    const estimated = estimateContext(context(path), "a", "p/m", 100);
    expect(estimated).toBeGreaterThan(196_000);
    expect(estimated).toBeLessThan(197_000); // Do not add the 150k cacheRead a second time.
    expect(estimateContext(context(path), "a", "other/model", 100)).toBeLessThan(7000);
    append(path, checkpoint("1"));
    expect(estimateContext(context(path), "a", "p/m", 100)).toBeLessThan(7000);
  });

  it("Summary material omits thinking and native data, marks truncated tool output, and preserves user text without truncation", () => {
    const path = pathOf(message("a", "User request" + "u".repeat(3000)),
      thinking("a", "r", 0, "Hidden thinking", { continuation: { openai: { reasoningEncryptedContent: "encrypted" } } }),
      call("a", "r", 1, "c", { arguments: { resource_id: "directory", target: { path: "src/main.ts" } },
        outcome: { kind: "succeeded", data: { private: "GUI only" }, model: [{ kind: "text", text: "result".repeat(1000) }] } }));
    const serialized = serializeForSummary(projectForAgent(view(path), "a"));
    expect(serialized).toContain("u".repeat(3000));
    expect(serialized).toContain("4000 characters omitted");
    expect(serialized).toContain("src/main.ts");
    expect(serialized).not.toMatch(/Hidden thinking|encrypted|GUI only/);
  });
});
