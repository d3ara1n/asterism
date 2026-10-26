import { describe, expect, it } from "vitest";
import type { ModelCompletion, ModelLiveBlock } from "@asterism/sdk/contracts";
import { ContextSummary } from "@asterism/builtin-api/contracts";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { agentSource, call, event, message, node, text, thinking } from "../../../../../src/session/test-nodes";
import type { InlineFeedback } from "../feedback";
import { displayedTimeline, savedTimeline, withLive } from "./timeline";
import { groupTurnProcesses, visibleTurnProcesses } from "./turn-process";

const completion = { finishReason: "stop", rawFinishReason: null, providerResponseId: null,
  usage: { input: 100, output: 20, total: 120, cacheRead: null, cacheWrite: null, reasoning: null } } satisfies ModelCompletion;
function project(path: ReturnType<typeof node>[], running = false, live: readonly ModelLiveBlock[] = [], feedback: readonly InlineFeedback[] = []) {
  const snapshot = sessionSnapshot(nodeView("s", "", path, path.at(-1)?.id ?? null));
  return groupTurnProcesses(displayedTimeline(withLive(savedTimeline(snapshot, "a", running, feedback), live)), running);
}
const ids = (grouped: ReturnType<typeof project>, open: readonly string[] = []) =>
  visibleTurnProcesses(grouped, new Set(open)).map(item => item.id);

describe("收束轮次的执行过程收纳", () => {
  // 最终响应可有多个正文块并夹有思考；按最后完成响应的身份判断，避免漏块或把早期正文当结果。
  it("收起全部过程并保留最终响应的所有正文，展开在概要上方恢复原条目", () => {
    const path = [
      node("u", null, message("a", "Work")),
      node("progress", "u", text("a", "work", 0, "Inspecting")),
      node("tool", "progress", call("a", "work", 1, "read")),
      node("thinking", "tool", thinking("a", "final", 0, "Reasoning")),
      node("part2", "thinking", text("a", "final", 2, "Second", { completion })),
      node("part1", "part2", text("a", "final", 1, "First")),
    ];
    const grouped = project(path);
    expect(ids(grouped)).toEqual(["u", "turn-process:u", "part1", "part2", "turn-metrics:u"]);
    expect(ids(grouped, [...grouped.processIds]))
      .toEqual(["u", "progress", "tool", "thinking", "turn-process:u", "part1", "part2", "turn-metrics:u"]);
    expect(grouped.items.find(item => item.kind === "turn-process")).toMatchObject({ toolCount: 1, incomplete: false });
    expect(grouped.owners.get(JSON.stringify(["work", 1]))).toBe("turn-process:u");
    expect(grouped.owners.has(JSON.stringify(["final", 1]))).toBe(false);
  });

  // 同轮 steer 不应随过程消失，也不能拆成两轮；错误提示仍须可直接阅读与打开详情。
  it("中途补充与错误提示保持可见，展开保留它们与过程的相对顺序", () => {
    const path = [
      node("u", null, message("a", "Work")),
      node("progress", "u", text("a", "work", 0, "Inspecting")),
      node("steer", "progress", message("a", "Correction", false)),
      node("tool", "steer", call("a", "work2", 0, "read")),
      node("reply", "tool", text("a", "final", 0, "Done", { completion })),
    ];
    const feedback: InlineFeedback[] = [
      { id: "error", afterNodeId: "progress", origin: "model", level: "error", code: "provider_error", message: "HTTP 429" },
    ];
    const grouped = project(path, false, [], feedback);
    expect(ids(grouped)).toEqual(["u", "error", "steer", "turn-process:u", "reply", "turn-metrics:u"]);
    expect(ids(grouped, [...grouped.processIds]))
      .toEqual(["u", "progress", "error", "steer", "tool", "turn-process:u", "reply", "turn-metrics:u"]);
  });

  // ask_user 可以在已有落库过程之后等待；单条工具结束或正文结束不代表轮次收束。
  it("历史轮次可收起，正在等待交互的轮次连同实时工具始终显示", () => {
    const path = [
      node("old", null, message("a", "Earlier")),
      node("old-tool", "old", call("a", "old-work", 0, "read")),
      node("old-reply", "old-tool", text("a", "old-final", 0, "Done", { completion })),
      node("u", "old-reply", message("a", "Work")),
      node("progress", "u", text("a", "work", 0, "Need your answer")),
    ];
    const live: ModelLiveBlock = { id: "question", responseId: "work", ordinal: 1, kind: "toolcall",
      name: "ask_user", arguments: {}, argumentsText: "{}", state: "executing", invocation: null, result: null };
    const grouped = project(path, true, [live]);
    expect(ids(grouped)).toEqual(["old", "turn-process:old", "old-reply", "turn-metrics:old", "u", "progress", "question"]);
    expect(grouped.owners.has(JSON.stringify(["work", 1]))).toBe(false);
  });

  // 停止后没有最终答复；继续仍是原轮，过程须重新出现，新一轮收束时才再次提供折叠。
  it("中断收起过程并保留反馈，继续执行恢复原流且不把部分输出冒充最终答复", () => {
    const path = [
      node("u", null, message("a", "Work")),
      node("partial", "u", text("a", "cut", 0, "Partial", { complete: false })),
    ];
    const feedback: InlineFeedback[] = [
      { id: "stopped", afterNodeId: "partial", origin: "model", level: "error", code: "interrupted", message: "Stopped" },
    ];
    const stopped = project(path, false, [], feedback);
    expect(ids(stopped)).toEqual(["u", "turn-process:u", "stopped", "turn-metrics:u"]);
    expect(stopped.items.find(item => item.kind === "turn-process")).toMatchObject({ incomplete: true });
    expect(ids(project(path, true, [], feedback))).toEqual(["u", "partial", "stopped"]);
    path.push(node("done", "partial", text("a", "resumed", 0, "Done", { completion })));
    expect(ids(project(path, false, [], feedback))).toEqual(["u", "turn-process:u", "stopped", "done", "turn-metrics:u"]);
  });

  // 压缩标记表达事件，不参与过程收纳；没有正文时也不应凭空产生收纳按钮。
  it("只有压缩的轮次保留独立标记与错误提示，下一轮不吞并它", () => {
    const path = [
      node("u", null, message("a", "Work")),
      node("summary", "u", event(ContextSummary.id, { summary: "Context", keptFrom: "u", model: "p/m",
        tokensBefore: 1000, completion }, { source: agentSource("a") })),
    ];
    const feedback: InlineFeedback[] = [
      { id: "error", afterNodeId: "summary", origin: "model", level: "error", code: "provider_error", message: "HTTP 429" },
    ];
    expect(ids(project(path, true, [], feedback))).toEqual(["u", "summary", "error"]);
    expect(ids(project(path, false, [], feedback))).toEqual(["u", "summary", "error"]);
    path.push(node("next", "summary", message("a", "Next")));
    path.push(node("reply", "next", text("a", "final", 0, "Done", { completion })));
    const grouped = project(path, false, [], feedback);
    expect(ids(grouped)).toEqual(["u", "summary", "error", "next", "reply", "turn-metrics:next"]);
    expect(grouped.processIds.size).toBe(0);
  });

  // 正常最终响应之后也会压缩；整理最终正文不能把压缩标记搬到答复之前或收入过程。
  it("过程中的压缩与答复后的压缩均保持可见和原有先后关系", () => {
    const summary = (keptFrom: string) => event(ContextSummary.id, { summary: "Internal summary", keptFrom,
      model: "p/m", tokensBefore: 1000, completion }, { source: agentSource("a") });
    const path = [
      node("u", null, message("a", "Work")),
      node("tool", "u", call("a", "work", 0, "read")),
      node("before", "tool", summary("u")),
      node("reply", "before", text("a", "final", 0, "Done", { completion })),
      node("after", "reply", summary("reply")),
    ];
    expect(ids(project(path))).toEqual(["u", "turn-process:u", "before", "reply", "after", "turn-metrics:u"]);
    expect(ids(project(path), ["turn-process:u"])).toEqual(["u", "tool", "turn-process:u", "before", "reply", "after", "turn-metrics:u"]);
  });

  // 普通直接回答没有可隐藏的内容，纯思考完成却没有最终正文；两者都不能生成假的输出。
  it("直接回答省略空概要，没有最终正文时概要仍可打开真实过程", () => {
    const direct = [node("u", null, message("a", "Hello")), node("reply", "u", text("a", "final", 0, "Hello", { completion }))];
    expect(ids(project(direct))).toEqual(["u", "reply", "turn-metrics:u"]);
    const reasoning = [direct[0]!, node("thinking", "u", thinking("a", "final", 0, "Reasoning", { completion }))];
    const grouped = project(reasoning);
    expect(ids(grouped)).toEqual(["u", "turn-process:u", "turn-metrics:u"]);
    expect(ids(grouped, [...grouped.processIds])).toEqual(["u", "thinking", "turn-process:u", "turn-metrics:u"]);
  });
});
