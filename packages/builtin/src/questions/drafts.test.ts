import { describe, expect, it } from "vitest";
import { createQuestionDrafts, draftSubmission } from "./drafts.ts";
import { answerIssue, resolveAnswers } from "./answers.ts";
import type { PendingQuestion } from "./contract.ts";

const pending: PendingQuestion = {
  id: "request", callId: "call", questions: [{ id: "choice", type: "single", question: "Which?", required: true,
    options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }],
};
describe("question draft continuity", () => {
  // Remounting while submission is still in transit must not allow further editing or submission, which would separate the UI draft from the submitted answers.
  it("preserves the operation lock across remounts and retains the original draft for retry after failure", async () => {
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

  // Card unmounts and view switches preserve drafts; completion notifications clean up the current instance without mixing answers across Agents.
  it("retrieves the same draft on remount and releases it on completion without affecting other Agents", () => {
    const drafts = createQuestionDrafts();
    const entry = drafts.get("session", "agent", pending);
    const original = entry.getSnapshot();
    entry.update({ ...original, message: "Keep this constraint" });
    expect(drafts.get("session", "agent", pending).getSnapshot().message).toBe("Keep this constraint");
    const other = drafts.get("session", "other", pending);
    expect(other.getSnapshot().message).toBe("");
    drafts.reconcile("session", "agent", [pending.id]);
    expect(drafts.get("session", "agent", pending)).toBe(entry);
    drafts.reconcile("session", "agent", []);
    expect(drafts.get("session", "agent", pending)).not.toBe(entry);
    expect(drafts.get("session", "other", pending)).toBe(other);
    // An exiting component's handle remains readable without putting the released instance back in the index.
    expect(entry.getSnapshot().message).toBe("Keep this constraint");
    drafts.clear();
  });

  // Custom answers and single-choice selections are mutually exclusive; an edited but unselected custom draft must not silently become the answer.
  it("preserves but does not submit the custom draft when switching back to an option, and includes no draft answer when explicitly skipping", () => {
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

  // Optional text left blank can be reviewed and submitted, with an explicit skipped sent to the backend; required questions cannot be skipped the same way.
  it("converts blank optional text to skipped and requires content for mandatory text only during submission validation", () => {
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

  // Editable multiple-choice options are submitted only when selected; selected blank custom options must show a prompt rather than being silently omitted.
  it("selects custom multiple-choice entries independently and preserves drafts without sending them when deselected", () => {
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
