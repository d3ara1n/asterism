import { describe, expect, it } from "vitest";
import type { ModelBlock, SessionRecord } from "@asterism/sdk/contracts";
import { jsonSchema } from "@asterism/sdk/contracts";
import { Execution, AgentInputMessage } from "@asterism/builtin-api/contracts";
import { cleanTitle, collectTurns, namingPrompt } from "./policy.ts";

function record(id: string, contract: string, data: SessionRecord["data"], agentId: string): SessionRecord {
  return { id, sessionId: "s", parentId: null, sequence: 0, createdAt: "2026-10-12T00:00:00Z",
    contract: { id: contract }, source: { plugin: "asterism.builtin", resource: { sessionId: "s", id: agentId, kind: "asterism.builtin/agent" } }, data, context: null };
}
const input = (id: string, agentId: string, text: string) => record(id, AgentInputMessage.id, { sender: { kind: "user" }, startsTurn: true, parts: [{ kind: "text", text }] }, agentId);
function output(id: string, agentId: string, origin: string, text: string, extra: Partial<ModelBlock> = {}) {
  return record(id, Execution.id, jsonSchema.parse({ type: "block", block: {
    kind: "text", text, responseId: id, requestParentId: origin, ordinal: 0, complete: true,
    continuation: null, source: { model: "test", adapter: "test", scope: "test" }, ...extra,
  } }), agentId);
}

describe("自动命名的领域材料", () => {
  it("交错代理按请求起点配对；继续更新原回合，多正文块按序合并，思考与未完成正文排除", () => {
    const records = [
      input("a1", "a", "修复登录"), input("b1", "b", "整理账单"),
      output("a-progress", "a", "b1", "正在检查"), output("b-final", "b", "a-progress", "已核对账单"),
      output("a-final-2", "a", "b-final", "通过测试", { responseId: "a-final", ordinal: 2 }),
      output("a-final-1", "a", "b-final", "修复 token 刷新", { responseId: "a-final", ordinal: 1 }),
      output("thinking", "a", "a-final-1", "秘密思考", { kind: "thinking", summary: "" }),
      output("partial", "a", "thinking", "不完整产出", { complete: false }),
      input("a2", "a", "补充说明"),
      output("late", "a", "a1", "原请求迟到的回复"),
    ];
    expect(collectTurns(records)).toEqual([
      { user: "修复登录", assistant: "原请求迟到的回复" },
      { user: "整理账单", assistant: "已核对账单" },
      { user: "补充说明" },
    ]);
    expect(collectTurns(records.slice(0, -2))[0]?.assistant).toBe("修复 token 刷新\n通过测试");
  });

  it("长对话保留前后各四回合，字段头尾与角色结构保持，最新用户输入可没有回复", () => {
    const turns = Array.from({ length: 12 }, (_, i) => ({ user: `用户${i + 1}`, assistant: `结果${i + 1}` }));
    turns[0]!.user = "开头" + "x".repeat(300) + "末尾";
    const prompt = namingPrompt([...turns, { user: "最后请求" }]);
    expect(prompt).toContain("开头");
    expect(prompt).toContain("末尾");
    for (const index of [2, 3, 4, 10, 11, 12]) expect(prompt).toContain("用户" + index);
    for (const index of [5, 6, 7, 8, 9]) expect(prompt).not.toContain("用户" + index);
    expect(prompt).toContain("最后请求");
    expect(prompt).toContain("结果12");
    expect(prompt).toMatch(/5.*omit/i);
  });

  it("清理标题包装并按 Unicode 字符限制长度，空标题保持为空", () => {
    expect(cleanTitle('<title>Title: “修复登录。”</title>')).toBe("修复登录");
    expect(Array.from(cleanTitle("🛠".repeat(70)))).toHaveLength(50);
    expect(cleanTitle("<title> </title>")).toBe("");
  });
});
