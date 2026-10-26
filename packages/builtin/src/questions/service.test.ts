import { describe, expect, it, vi } from "vitest";
import { Agent } from "@asterism/builtin-api/contracts";
import { askUserArgs, AskUserResult, type Question, type Submission } from "./contract.ts";
import { createQuestionService } from "./service.ts";

const object = { sessionId: "session", id: "agent", kind: Agent.kind };
const choices = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }];
const questions = askUserArgs.parse({ questions: [
  { id: "single", type: "single", question: "Which approach?", options: choices },
  { id: "multiple", type: "multiple", question: "Which targets?", options: choices },
  { id: "text", type: "text", question: "Any context?", required: false },
] }).questions;

describe("结构化问答契约", () => {
  // 身份唯一、推荐必须引用实际选项；否则结果无法稳定关联提问。
  it("拒绝歧义身份及不存在的推荐，文本题不接受选择题参数", () => {
    expect(askUserArgs.safeParse({ questions: [questions[0], questions[0]] }).success).toBe(false);
    expect(askUserArgs.safeParse({ questions: [{ ...questions[0], options: [choices[0], choices[0]] }] }).success).toBe(false);
    expect(askUserArgs.safeParse({ questions: [{ ...questions[0], recommendation: { optionId: "other", reason: "Reason" } }] }).success).toBe(false);
    expect(askUserArgs.safeParse({ questions: [{ ...questions[2], options: choices }] }).success).toBe(false);
  });

  // 整体校验后才返回；标题来自原提问，选择、自定义与整组意见不能相互覆盖。
  it("按原题顺序返回选择与用户原文，显式保留跳过状态", async () => {
    const service = createQuestionService(() => {});
    const waiting = service.ask(object, "call", questions, new AbortController().signal);
    const id = service.read(object).pending[0]!.id;
    service.answer(object, id, { answers: [
      { id: "text", status: "skipped" },
      { id: "multiple", status: "answered", selected: ["b", "a"], text: "  Gamma\nDelta  " },
      { id: "single", status: "answered", selected: ["b"] },
    ], message: "Do not deploy yet" });
    await expect(waiting).resolves.toEqual({ kind: "succeeded", data: {
      answers: [
        { id: "single", question: "Which approach?", type: "single", status: "answered", selected: [{ id: "b", label: "Beta" }] },
        { id: "multiple", question: "Which targets?", type: "multiple", status: "answered", selected: choices, text: "Gamma\nDelta" },
        { id: "text", question: "Any context?", type: "text", status: "skipped", selected: [] },
      ], message: "Do not deploy yet",
    } });
    expect(service.read(object).pending).toEqual([]);
  });

  const cases: [string, Question, Submission][] = [
    ["未知题目", questions[0]!, { answers: [{ id: "unknown", status: "answered", selected: ["a"] }] }],
    ["重复回答", questions[0]!, { answers: [1, 2].map(() => ({ id: "single", status: "answered", selected: ["a"] })) }],
    ["必填题缺失", questions[0]!, { answers: [] }],
    ["必填题跳过", questions[0]!, { answers: [{ id: "single", status: "skipped" }] }],
    ["伪造选项", questions[0]!, { answers: [{ id: "single", status: "answered", selected: ["unknown"] }] }],
    ["单选与自定义同时提交", questions[0]!, { answers: [{ id: "single", status: "answered", selected: ["a"], text: "Custom" }] }],
    ["单选提交多项", questions[0]!, { answers: [{ id: "single", status: "answered", selected: ["a", "b"] }] }],
    ["多选重复项", questions[1]!, { answers: [{ id: "multiple", status: "answered", selected: ["a", "a"] }] }],
    ["多选空值冒充答案", questions[1]!, { answers: [{ id: "multiple", status: "answered", selected: [] }] }],
    ["文本题携带选项", questions[2]!, { answers: [{ id: "text", status: "answered", selected: ["a"], text: "Text" }] }],
    ["可选题留空冒充跳过", questions[2]!, { answers: [{ id: "text", status: "answered", selected: [] }] }],
  ];
  // 无效提交不得消费等待；空答案、跳过和取消各有明确语义。
  it.each(cases)("%s不结束等待", async (_name, question, submission) => {
    const service = createQuestionService(() => {});
    const controller = new AbortController();
    const waiting = service.ask(object, "call", [question], controller.signal);
    const id = service.read(object).pending[0]!.id;
    try {
      expect(() => service.answer(object, id, submission)).toThrow(expect.objectContaining({ code: "invalid_argument" }));
      expect(service.read(object).pending).toHaveLength(1);
    } finally { controller.abort(); await waiting; }
  });

  // 每题始终允许自定义回答；选项不能限制用户表达。
  it("单选可完全使用自定义答案", async () => {
    const service = createQuestionService(() => {});
    const waiting = service.ask(object, "custom", [questions[0]!], new AbortController().signal);
    service.answer(object, service.read(object).pending[0]!.id, { answers: [{ id: "single", status: "answered", selected: [], text: "Neither; use another approach" }] });
    await expect(waiting).resolves.toMatchObject({ kind: "succeeded", data: { answers: [{ selected: [], text: "Neither; use another approach" }] } });
  });

  // 同一 Agent 多组提问独立，取消不提交部分草稿、不消费其他等待。
  it("取消只结束指定实例，变化事件和工具过程态关联同一等待身份", async () => {
    const events: string[][] = [];
    const published: string[] = [];
    const service = createQuestionService((_object, pending) => { events.push(pending.map(item => item.id)); });
    const first = service.ask(object, "first", questions, new AbortController().signal, id => published.push(id));
    const second = service.ask(object, "second", questions, new AbortController().signal, id => published.push(id));
    const [a, b] = service.read(object).pending;
    expect(published).toEqual([a!.id, b!.id]);
    service.cancel(object, a!.id);
    expect(events.at(-1)).toEqual([b!.id]);
    await expect(first).resolves.toEqual({ kind: "cancelled", data: null, message: expect.any(String) });
    service.cancel(object, b!.id);
    await second;
  });

  // 通知不回滚已受理答案，否则 UI 提交成功而模型收到工具失败。
  it("结束通知失败仍交付已受理答案，记录错误且快照可恢复界面", async () => {
    const error = new Error("Event delivery failed.");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = createQuestionService((_object, pending) => { if (!pending.length) throw error; });
    const controller = new AbortController();
    const waiting = service.ask(object, "answer", [questions[2]!], controller.signal);
    try {
      const id = service.read(object).pending[0]!.id;
      service.answer(object, id, { answers: [{ id: "text", status: "answered", selected: [], text: "Accepted" }] });
      await expect(waiting).resolves.toMatchObject({ kind: "succeeded", data: { answers: [{ text: "Accepted" }] } });
      expect(service.read(object).pending).toEqual([]);
      expect(log).toHaveBeenCalledWith("Question state notification failed after settlement.", error);
    } finally {
      controller.abort();
      try { await waiting; }
      finally { log.mockRestore(); }
    }
  });

  // 数据兼容：新版展示继续解码原有工具记录，不改写已保存结果。
  it("继续解码旧版文本答案", () => {
    expect(AskUserResult.schema.parse({ answer: "Legacy answer" })).toEqual({ answer: "Legacy answer" });
    const legacy = { answers: [{ id: "text", question: "Any context?", type: "text", status: "answered", selected: [], text: "Context", comment: "Original qualification" }] };
    expect(AskUserResult.schema.parse(legacy)).toEqual(legacy);
  });
});
