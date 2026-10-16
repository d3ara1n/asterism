import { describe, expect, it } from "vitest";
import { createQuestionDrafts, draftSubmission } from "./drafts.ts";
import { answerIssue, resolveAnswers } from "./answers.ts";
import type { PendingQuestion } from "./contract.ts";

const pending: PendingQuestion = {
  id: "request", callId: "call", questions: [{ id: "choice", type: "single", question: "Which?", required: true,
    options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }],
};
describe("问答草稿连续性", () => {
  // workbench.md：提交仍在通信中时重挂载不能再次编辑或提交，否则界面草稿与已发送答案会分离。
  it("操作锁跨重挂载保留，失败后保留原草稿并允许重试", async () => {
    const drafts = createQuestionDrafts();
    const entry = drafts.get("session", "agent", pending);
    entry.update({ ...entry.getSnapshot(), message: "Original" });
    let reject!: (reason: Error) => void;
    const response = new Promise<void>((_resolve, fail) => { reject = fail; });
    const operation = entry.perform(() => response);
    const remounted = drafts.get("session", "agent", pending);
    expect(remounted.getOperationSnapshot()).toEqual({ busy: true, failed: false });
    remounted.update({ ...remounted.getSnapshot(), message: "Changed while submitting" });
    let duplicate = false;
    await remounted.perform(async () => { duplicate = true; });
    expect(duplicate).toBe(false);
    expect(remounted.getSnapshot().message).toBe("Original");
    reject(new Error("Disconnected"));
    await operation;
    expect(remounted.getOperationSnapshot()).toEqual({ busy: false, failed: true });
    await remounted.perform(async () => {});
    expect(remounted.getOperationSnapshot()).toEqual({ busy: false, failed: false });
  });

  // workbench.md：卡片卸载与视图切换不丢草稿；完成通知清理当前实例，不能跨 Agent 串答。
  it("重挂载取得同一草稿，乱序快照不清理新草稿，完成后释放且不影响其他 Agent", () => {
    const drafts = createQuestionDrafts();
    const entry = drafts.get("session", "agent", pending);
    const original = entry.getSnapshot();
    entry.update({ ...original, message: "Keep this constraint" });
    expect(drafts.get("session", "agent", pending).getSnapshot().message).toBe("Keep this constraint");
    const other = drafts.get("session", "other", pending);
    expect(other.getSnapshot().message).toBe("");
    drafts.reconcile("session", "agent", 3, [pending.id]);
    drafts.reconcile("session", "agent", 2, []);
    expect(drafts.get("session", "agent", pending)).toBe(entry);
    drafts.reconcile("session", "agent", 4, []);
    expect(drafts.get("session", "agent", pending)).not.toBe(entry);
    expect(drafts.get("session", "other", pending)).toBe(other);
    // 退场组件的句柄仍可读取，不会把已释放的实例重新放回索引。
    expect(entry.getSnapshot().message).toBe("Keep this constraint");
    drafts.clear();
  });

  // workbench.md：自定义与单选互斥；已编辑但未选中的自定义草稿不能悄悄成为答案。
  it("切回选项保留自定义草稿但不提交，显式跳过不携带草稿答案", () => {
    const entry = createQuestionDrafts().get("session", "agent", pending);
    const draft = entry.getSnapshot();
    draft.answers[0] = { selected: ["a"], custom: false, text: "Alternative", skipped: false };
    expect(draftSubmission(pending.questions, draft).answers).toEqual([
      { id: "choice", status: "answered", selected: ["a"] },
    ]);
    draft.answers[0]!.custom = true;
    expect(draftSubmission(pending.questions, draft).answers).toEqual([
      { id: "choice", status: "answered", selected: [], text: "Alternative" },
    ]);
    draft.answers[0]!.skipped = true;
    expect(draftSubmission(pending.questions, draft).answers).toEqual([{ id: "choice", status: "skipped" }]);
  });

  // workbench.md：可选文本留空应可复核与提交，后端仍收到明确 skipped；必填题不能同样跳过。
  it("可选文本留空转换为跳过，必填文本只在提交校验时要求内容", () => {
    const request: PendingQuestion = { ...pending, questions: [
      { id: "optional", type: "text", question: "Anything else?", required: false },
      { id: "required", type: "text", question: "Your goal?", required: true },
    ] };
    const draft = createQuestionDrafts().get("session", "agent", request).getSnapshot();
    draft.answers[0]!.text = "  \n ";
    const submission = draftSubmission(request.questions, draft);
    expect(submission.answers[0]).toEqual({ id: "optional", status: "skipped" });
    expect(answerIssue(request.questions[0]!, submission.answers[0])).toBeNull();
    expect(answerIssue(request.questions[1]!, submission.answers[1])).not.toBeNull();
    draft.answers[1]!.text = "Build a prototype";
    expect(resolveAnswers(request.questions, draftSubmission(request.questions, draft)).answers).toMatchObject([
      { id: "optional", status: "skipped" }, { id: "required", status: "answered", text: "Build a prototype" },
    ]);
  });

  // workbench.md：多选的可编辑选项只有勾选才提交；已选空白自定义项须提示，不能悄悄省略。
  it("多选自定义项独立勾选，取消勾选保留草稿但不发送", () => {
    const choice = pending.questions[0]!;
    if (choice.type !== "single") throw new Error("Expected choice question.");
    const question = { ...choice, type: "multiple" as const };
    const request = { ...pending, questions: [question] };
    const draft = createQuestionDrafts().get("session", "agent", request).getSnapshot();
    draft.answers[0] = { selected: ["a"], custom: false, text: "My option", skipped: false };
    expect(draftSubmission(request.questions, draft).answers[0]).toEqual({ id: "choice", status: "answered", selected: ["a"] });
    draft.answers[0]!.custom = true;
    expect(draftSubmission(request.questions, draft).answers[0]).toEqual({ id: "choice", status: "answered", selected: ["a"], text: "My option" });
    draft.answers[0]!.text = "";
    expect(answerIssue(question, draftSubmission(request.questions, draft).answers[0])).not.toBeNull();
    draft.answers[0]!.custom = false;
    expect(answerIssue(question, draftSubmission(request.questions, draft).answers[0])).toBeNull();
  });
});
