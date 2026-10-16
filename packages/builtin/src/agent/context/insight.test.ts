import { describe, expect, it } from "vitest";
import type { ModelCompletion } from "@atelier/sdk/contracts";
import { sessionView } from "../../../../../src/plugins/records.ts";
import { nodeView } from "../../../../../src/session/view.ts";
import { agentSource, attached, call, event, message, node, text, thinking } from "../../../../../src/session/test-nodes.ts";
import type { NewNode, SessionNode } from "../../../../../src/shared/session.ts";
import { ContextSummary, RequestDiagnosticsRecord } from "@atelier/builtin-api/contracts";
import { allocateTiles, contextInsight } from "./insight.ts";

const completion = (input: number): ModelCompletion => ({ finishReason: "stop", rawFinishReason: null, providerResponseId: null,
  usage: { input, output: 1, total: input + 1, cacheRead: 0, cacheWrite: 0, reasoning: 0 } });
const diagnostics = (responseId: string, file: string): NewNode => event(RequestDiagnosticsRecord.id,
  { responseId, diagnostics: { system: [{ kind: "context", file, characters: 5 }], tools: ["resource_list"] } }, { source: agentSource("a") });
function pathOf(...values: NewNode[]): SessionNode[] {
  return values.map((value, index) => node(String(index), index ? String(index - 1) : null, value));
}
const insight = (path: SessionNode[], agent = "a") => contextInsight(sessionView(nodeView("s", "", path, path.at(-1)?.id ?? null)), agent);

// docs/workbench.md#代理上下文：构成按下一次请求的模型投影计字，窗口与系统部分只取已保存的真实计量。
describe("代理上下文洞察", () => {
  it("对话按投影分类计码点；未完成块、其他代理与摘要替换的前缀不计入", () => {
    const path = pathOf(
      message("a", "旧问题"), text("a", "old", 0, "old answer", { requestParentId: "0", completion: completion(900) }),
      diagnostics("old", "/old/AGENTS.md"),
      message("a", "问题😀"), attached("a", "dir", "linked"),
      thinking("a", "r", 0, "think", { requestParentId: "4" }),
      call("a", "r", 1, "c1", { requestParentId: "4", arguments: { p: 1 } }),
      text("a", "r", 2, "partial", { requestParentId: "4", complete: false }),
      message("b", "other agent"),
    );
    path.push(node("s", "8", event(ContextSummary.id, { summary: "摘要", keptFrom: "3", model: "p/m", tokensBefore: 1000, completion: completion(10) },
      { source: agentSource("a") })));
    const result = insight(path);
    expect(result.conversation.characters).toEqual({
      user: 3, assistant: 0, thinking: 5, toolcall: '{"p":1}'.length, result: 2, context: "linked".length,
      summary: expect.any(Number),
    });
    expect(result.conversation.characters.summary).toBeGreaterThan(2);
    // 摘要在最近一次计量之后，旧 input 不再代表窗口占用。
    expect(result.usage).toMatchObject({ input: 900, compressedAfter: true });
    expect(result.system).toMatchObject({ responseId: "old", diagnostics: { tools: ["resource_list"] } });
  });

  it("窗口与系统取当前路径上最近的计量；回溯后对应该路径", () => {
    const nodes = [
      node("0", null, message("a", "go")),
      node("1", "0", text("a", "first", 0, "one", { requestParentId: "0", completion: completion(100) })),
      node("2", "1", diagnostics("first", "/a/AGENTS.md")),
      node("3", "2", message("a", "again")),
      node("4", "3", text("a", "second", 0, "two", { requestParentId: "3", completion: completion(250) })),
      node("5", "4", diagnostics("second", "/b/AGENTS.md")),
    ];
    const latest = contextInsight(sessionView(nodeView("s", "", nodes, "5")), "a");
    expect(latest.usage).toMatchObject({ input: 250, compressedAfter: false });
    expect(latest.system?.diagnostics.system).toEqual([{ kind: "context", file: "/b/AGENTS.md", characters: 5 }]);
    const earlier = contextInsight(sessionView(nodeView("s", "", nodes, "2")), "a");
    expect(earlier.usage?.input).toBe(100);
    expect(earlier.system?.responseId).toBe("first");
    expect(insight(pathOf(message("a", "new")))).toMatchObject({ usage: null, system: null });
  });

  it("瓷砖按最大余数分配且总数固定，非零类别至少一格", () => {
    expect(allocateTiles([1, 1000, 0], 100)).toEqual([1, 99, 0]);
    expect(allocateTiles([1, 1, 1], 100).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(allocateTiles([0, 0], 100)).toEqual([0, 0]);
  });
});
