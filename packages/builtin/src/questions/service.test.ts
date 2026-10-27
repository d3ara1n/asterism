import { describe, expect, it, vi } from "vitest";
import { Agent } from "@asterism-app/builtin-api/contracts";
import { askUserArgs, AskUserResult, type Question, type Submission } from "./contract.ts";
import { createQuestionService } from "./service.ts";

const object = { sessionId: "session", id: "agent", kind: Agent.kind };
const choices = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }];
const questions = askUserArgs.parse({ questions: [
  { id: "single", type: "single", question: "Which approach?", options: choices },
  { id: "multiple", type: "multiple", question: "Which targets?", options: choices },
  { id: "text", type: "text", question: "Any context?", required: false },
] }).questions;

describe("structured question-and-answer contract", () => {
  // Identities must be unique, and recommendations must reference actual options; otherwise results cannot reliably associate with questions.
  it("rejects ambiguous identities and nonexistent recommendations, and disallows choice parameters for text questions", () => {
    expect(askUserArgs.safeParse({ questions: [questions[0], questions[0]] }).success).toBe(false);
    expect(askUserArgs.safeParse({ questions: [{ ...questions[0], options: [choices[0], choices[0]] }] }).success).toBe(false);
    expect(askUserArgs.safeParse({ questions: [{ ...questions[0], recommendation: { optionId: "other", reason: "Reason" } }] }).success).toBe(false);
    expect(askUserArgs.safeParse({ questions: [{ ...questions[2], options: choices }] }).success).toBe(false);
  });

  // Return only after validating the whole set; titles come from the original questions, and selections, custom answers, and overall comments must not overwrite one another.
  it("returns selections and original user text in question order and explicitly preserves skipped status", async () => {
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
    ["unknown question", questions[0]!, { answers: [{ id: "unknown", status: "answered", selected: ["a"] }] }],
    ["duplicate answers", questions[0]!, { answers: [1, 2].map(() => ({ id: "single", status: "answered", selected: ["a"] })) }],
    ["missing required question", questions[0]!, { answers: [] }],
    ["skipped required question", questions[0]!, { answers: [{ id: "single", status: "skipped" }] }],
    ["forged option", questions[0]!, { answers: [{ id: "single", status: "answered", selected: ["unknown"] }] }],
    ["single choice and custom answer submitted together", questions[0]!, { answers: [{ id: "single", status: "answered", selected: ["a"], text: "Custom" }] }],
    ["multiple selections for a single-choice question", questions[0]!, { answers: [{ id: "single", status: "answered", selected: ["a", "b"] }] }],
    ["duplicate multiple-choice selections", questions[1]!, { answers: [{ id: "multiple", status: "answered", selected: ["a", "a"] }] }],
    ["empty multiple-choice selection presented as an answer", questions[1]!, { answers: [{ id: "multiple", status: "answered", selected: [] }] }],
    ["options supplied for a text question", questions[2]!, { answers: [{ id: "text", status: "answered", selected: ["a"], text: "Text" }] }],
    ["blank optional answer presented as skipping", questions[2]!, { answers: [{ id: "text", status: "answered", selected: [] }] }],
  ];
  // Invalid submissions must not consume a wait; empty answers, skipping, and cancellation each have explicit semantics.
  it.each(cases)("%s does not end the wait", async (_name, question, submission) => {
    const service = createQuestionService(() => {});
    const controller = new AbortController();
    const waiting = service.ask(object, "call", [question], controller.signal);
    const id = service.read(object).pending[0]!.id;
    try {
      expect(() => service.answer(object, id, submission)).toThrow(expect.objectContaining({ code: "invalid_argument" }));
      expect(service.read(object).pending).toHaveLength(1);
    } finally { controller.abort(); await waiting; }
  });

  // Every question always permits a custom answer; options must not limit user expression.
  it("allows a single-choice question to use an entirely custom answer", async () => {
    const service = createQuestionService(() => {});
    const waiting = service.ask(object, "custom", [questions[0]!], new AbortController().signal);
    service.answer(object, service.read(object).pending[0]!.id, { answers: [{ id: "single", status: "answered", selected: [], text: "Neither; use another approach" }] });
    await expect(waiting).resolves.toMatchObject({ kind: "succeeded", data: { answers: [{ selected: [], text: "Neither; use another approach" }] } });
  });

  // Multiple question sets for the same Agent are independent; cancellation neither submits partial drafts nor consumes other waits.
  it("cancellation ends only the specified instance, and change events and tool progress refer to the same waiting identity", async () => {
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

  // Notifications do not roll back accepted answers; otherwise UI submission would succeed while the model receives a tool failure.
  it("delivers accepted answers even if completion notification fails, logs the error, and allows snapshots to restore the UI", async () => {
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

  // Data compatibility: the new display continues to decode existing tool records without rewriting saved results.
  it("continues to decode legacy text answers", () => {
    expect(AskUserResult.schema.parse({ answer: "Legacy answer" })).toEqual({ answer: "Legacy answer" });
    const legacy = { answers: [{ id: "text", question: "Any context?", type: "text", status: "answered", selected: [], text: "Context", comment: "Original qualification" }] };
    expect(AskUserResult.schema.parse(legacy)).toEqual(legacy);
  });
});
