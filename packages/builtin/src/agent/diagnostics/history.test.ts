import { describe, expect, it } from "vitest";
import { present, type ModelCompletion } from "@atelier/sdk/contracts";
import { sessionView } from "../../../../../src/plugins/records.ts";
import { nodeView } from "../../../../../src/session/view.ts";
import { agentSource, call, event, message, node, notice, text, thinking } from "../../../../../src/session/test-nodes.ts";
import { ContextSummary, Execution, AgentRequestContext, UserMessage } from "@atelier/builtin-api/contracts";
import { diagnosticHistory } from "./history.ts";

const completion: ModelCompletion = { finishReason: "stop", rawFinishReason: null, providerResponseId: "upstream-id",
  usage: { input: 100, output: 10, total: 110, cacheRead: 0, cacheWrite: 0, reasoning: 0 } };
const source = { model: "p/m", adapter: "test", scope: "scope" };
// docs/workbench.md 诊断契约：按响应身份计数，用真实父链区分分支；既有记录保持可读。
describe("代理诊断历史", () => {
  // 只有用户输入不构成已保存响应；成功摘要的真实计时仍可消费。
  it("无回复时没有诊断请求，成功压缩保留计时", () => {
    const timing = { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:01.000Z", durationMs: 1000,
      firstOutputMs: null, firstTextMs: null, firstReasoningMs: null, lastOutputMs: null, outputChunks: 0, outcome: "failed" };
    const nodes = [
      node("input", null, message("a", "Start")),
      node("summary", "input", event(ContextSummary.id, { summary: "S", keptFrom: "input", model: "p/m", tokensBefore: 777,
        completion: { ...completion, timing: { ...timing, outcome: "completed" } } }, { source: agentSource("a") })),
    ];
    const result = diagnosticHistory(sessionView(nodeView("s", "", nodes, "summary")), "a", "timeline");
    expect(diagnosticHistory(sessionView(nodeView("s", "", nodes, "input")), "a", "timeline").requests).toEqual([]);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({ kind: "compression", completion: { timing: { outcome: "completed" } }, sent: null });
    expect(result.unreadable).toBe(0);
  });
  it("乱序保存的响应块只计一个请求，当前路径与全分支不重复公共祖先", () => {
    const nodes = [
      node("input", null, message("a", "Start")),
      node("last", "input", text("a", "shared", 2, "Done", { requestParentId: "input", completion })),
      node("tool", "last", call("a", "shared", 0, "call", { requestParentId: "input" })),
      node("thought", "tool", thinking("a", "shared", 1, "Thinking", { requestParentId: "input" })),
      node("a-input", "thought", message("a", "Branch A")),
      node("a-answer", "a-input", text("a", "branch-a", 0, "A", { requestParentId: "a-input", completion })),
      node("b-input", "thought", message("a", "Branch B")),
      node("b-answer", "b-input", text("a", "branch-b", 0, "B", { requestParentId: "b-input", completion })),
      node("other", "a-answer", text("b", "another-agent", 0, "Other", { completion })),
    ];
    const snapshot = sessionView(nodeView("s", "", nodes, "other"));
    const current = diagnosticHistory(snapshot, "a", "timeline");
    expect(current.requests.map(request => request.responseId)).toEqual(["branch-a", "shared"]);
    const shared = current.requests[1]!;
    expect(shared.blocks.map(item => item.block.ordinal)).toEqual([0, 1, 2]);
    expect(shared.completion).toEqual(completion);
    expect(shared.relatedInput).toMatchObject({ id: "input", parts: [{ kind: "text", text: "Start" }] });
    const all = diagnosticHistory(snapshot, "a", "session");
    expect(all.requests.map(request => [request.responseId, request.onTimeline])).toEqual([["branch-b", false], ["branch-a", true], ["shared", true]]);
  });

  it("既有通知载荷仍可读，重复终态不重复计数，无身份通知单列", () => {
    const nodes = [
      node("input", null, message("a", "Start")),
      node("answer", "input", text("a", "r", 0, "Done", { requestParentId: "input", completion })),
      node("legacy", "answer", notice("a", "reported", "Reported", "info", {
        response: { ...completion, responseId: "r", requestParentId: "input", model: "p/m" },
      })),
      node("empty", "legacy", event(Execution.id, { type: "diagnostic", code: "empty_response", message: "Empty", level: "error",
        response: { ...completion, responseId: "empty", requestParentId: "legacy", source } }, { source: agentSource("a") })),
      node("summary", "empty", event(ContextSummary.id, { summary: "Summary", keptFrom: "input", model: "p/m:off", tokensBefore: 1000, completion }, { source: agentSource("a") })),
      node("failure", "summary", notice("a", "context_compression_failed", "Failed", "warning")),
      node("invalid", "failure", event(Execution.id, {}, { source: agentSource("a") })),
    ];
    const result = diagnosticHistory(sessionView(nodeView("s", "", nodes, "invalid")), "a", "timeline");
    expect(result.requests).toHaveLength(3);
    expect(result.requests.map(request => request.completion?.usage)).toEqual([completion.usage, completion.usage, completion.usage]);
    expect(result.requests[0]).toMatchObject({ kind: "compression", model: "p/m:off", summary: "Summary", inputHasFiles: false });
    expect(result.requests[1]).toMatchObject({ responseId: "empty", blocks: [], notices: [{ code: "empty_response" }] });
    expect(result.requests[2]?.notices).toMatchObject([{ code: "reported" }]);
    expect(result.notices).toMatchObject([{ code: "context_compression_failed" }]);
    expect(result.unreadable).toBe(1);
  });

  it("输入模态沿请求真实父链判断，压缩移除旧附件后不再影响新请求", () => {
    const file = { kind: "file", file: { "$atelier.content": "00000000-0000-4000-8000-000000000001" }, mediaType: "image/png" };
    const nodes = [
      node("file", null, event(UserMessage.id, { parts: [file] }, { source: agentSource("a") })),
      node("before", "file", text("a", "before", 0, "Read file", { requestParentId: "file", completion })),
      node("recent", "before", message("a", "Continue in text")),
      node("summary", "recent", event(ContextSummary.id, { summary: "File summarized", keptFrom: "recent", model: "p/m", tokensBefore: 1000, completion }, { source: agentSource("a") })),
      node("after", "summary", text("a", "after", 0, "Text", { requestParentId: "summary", completion })),
      node("branch", "file", text("a", "branch", 0, "Still file", { requestParentId: "file", completion })),
    ];
    const result = diagnosticHistory(sessionView(nodeView("s", "", nodes, "after")), "a", "session");
    expect(result.requests.find(request => request.responseId === "before")?.inputHasFiles).toBe(true);
    expect(result.requests.find(request => request.responseId === "after")?.inputHasFiles).toBe(false);
    expect(result.requests.find(request => request.responseId === "branch")?.inputHasFiles).toBe(true);
  });

  // docs/workbench.md#代理上下文：诊断来自同一终态；回溯到块就有完整资料。
  it("请求诊断随终态保存，回溯和分支只消费自身扩展", () => {
    const sent = { system: [{ kind: "agent", role: "worker", characters: 4 }], tools: ["resource_list"] };
    const nodes = [
      node("input", null, message("a", "Start")),
      node("first", "input", text("a", "first", 0, "One", { requestParentId: "input", completion })),
      node("summary", "first", event(ContextSummary.id, { summary: "S", keptFrom: "input", model: "p/m", tokensBefore: 777, completion }, { source: agentSource("a") })),
      node("second", "summary", text("a", "second", 0, "Two", { requestParentId: "summary",
        completion: { ...completion, extensions: [present(AgentRequestContext, sent)] } })),
      node("branch", "summary", text("a", "branch", 0, "Branch", { requestParentId: "summary", completion })),
    ];
    const result = diagnosticHistory(sessionView(nodeView("s", "", nodes, "second")), "a", "timeline");
    expect(result.requests.find(request => request.responseId === "second")?.sent).toEqual(sent);
    expect(result.requests.find(request => request.responseId === "first")?.sent).toBeNull();
    expect(result.requests.find(request => request.kind === "compression")).toMatchObject({ tokensBefore: 777, sent: null });
    const branch = diagnosticHistory(sessionView(nodeView("s", "", nodes, "branch")), "a", "timeline");
    expect(branch.requests.some(request => request.responseId === "second")).toBe(false);
    expect(branch.requests.find(request => request.responseId === "branch")?.sent).toBeNull();
  });
});
