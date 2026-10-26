import { describe, expect, it } from "vitest";
import type { ModelCompletion } from "@asterism/sdk/contracts";
import { projectAgentTurnState } from "./state-projection.ts";
import { agentExecutionState } from "./state.ts";
import { sessionView } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { attached, call, message, node, text, thinking } from "../../../../src/session/test-nodes.ts";
import type { NewNode } from "../../../../src/shared/session.ts";

const completion = (finishReason = "stop"): ModelCompletion => ({
  finishReason, rawFinishReason: finishReason === "stop" ? "end_turn" : null, usage: null, providerResponseId: null,
});
const answer = (responseId = "r1") => text("a", responseId, 0, "Done", { completion: completion() });
function project(values: NewNode[], running = false, interruptions: readonly (string | null)[] = []) {
  const path = values.map((value, index) => node(String(index), index ? String(index - 1) : null, value));
  return agentExecutionState(projectAgentTurnState(sessionView(nodeView("s", "", path, path.at(-1)?.id ?? null)), "a", interruptions), running);
}

// 预期来自 docs/runtime.md 的执行状态投影；只验证领域判断，不模拟组件或瞬态状态总线。
describe("代理执行状态投影", () => {
  it("没有自身用户输入时等待输入；已受理输入尚无回复时可继续，实际运行时优先显示停止", () => {
    expect(project([message("b", "For B")], false, ["0"])).toBe("empty");
    expect(project([message("a", "Go")])).toBe("incomplete");
    expect(project([message("a", "Go")], true)).toBe("running");
    expect(project([message("a", "Go"), answer()], true)).toBe("running");
  });

  it("正常完成从持久历史恢复，其他代理和资源事件不重新打开继续入口", () => {
    expect(project([
      message("a", "Go"), answer(), message("b", "For B"), attached("a", "dir"),
    ])).toBe("completed");
  });

  it("新输入与历史回溯重新确定待完成的工作，不沿用之后的正常完成", () => {
    const values = [message("a", "Go"), thinking("a", "r1", 0), text("a", "r1", 1, "Done", { completion: completion() })];
    expect(project(values)).toBe("completed");
    expect(project(values.slice(0, 2))).toBe("incomplete");
    expect(project([])).toBe("empty");
    expect(project([...values, message("a", "Next")])).toBe("incomplete");
  });

  it.each([
    ["缺少响应终态", text("a", "r1", 0, "Ended block")],
    ["输出达到长度限制", text("a", "r1", 0, "Truncated", { completion: completion("length") })],
    ["正文块未完成", text("a", "r1", 0, "Partial", { complete: false, completion: completion() })],
  ])("%s 不因正文存在而判为正常完成", (_reason, block) => {
    expect(project([message("a", "Go"), block])).toBe("incomplete");
  });

  it("响应末块可早于工具结局保存，工具批次全部结束也仍需下一次模型回复", () => {
    const values = [
      message("a", "Go"),
      text("a", "r1", 2, "I will use these results", { completion: completion() }),
      call("a", "r1", 1, "c2"),
      call("a", "r1", 0, "c1"),
    ];
    expect(project(values.slice(0, 2))).toBe("incomplete");
    expect(project(values)).toBe("incomplete");
    expect(project([...values, answer("r2")])).toBe("completed");
  });

  // 无新输出的失败不能沿用上次成功；内存中断仅作用于所在路径，后续响应重新确定状态。
  it("临时中断覆盖先前终态，后续成功响应与重启恢复不沿用中断", () => {
    const values = [message("a", "Go"), answer(), attached("a", "dir")];
    expect(project(values, false, ["1"])).toBe("incomplete");
    expect(project([...values, answer("r2")], false, ["1"])).toBe("completed");
    expect(project(values, false, ["other-branch"])).toBe("completed");
    expect(project(values)).toBe("completed");
  });
});
