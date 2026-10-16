import { z } from "zod";
import { defineCall } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const askUserArgs = z.strictObject({
  question: z.string().trim().min(1).describe("The question to show the user."),
}).describe("Ask the user a question and wait for a text answer.");
export const AskUserResult = builtin.data("ask-user", z.strictObject({
  answer: z.string().describe("The user's answer."),
}).describe("The user's answer to the question."));
export const pendingQuestionSchema = z.strictObject({
  id: z.string().uuid(), callId: z.string(), question: z.string(),
});
export const questionSnapshotSchema = z.strictObject({
  version: z.number().int().nonnegative(), pending: z.array(pendingQuestionSchema),
});
export const ReadQuestions = defineCall(builtin.name("questions.read"), {
  input: z.null(), output: questionSnapshotSchema,
});
export const AnswerQuestion = defineCall(builtin.name("questions.answer"), {
  input: z.strictObject({ id: z.string().uuid(), answer: z.string().trim().min(1) }), output: z.null(),
});
export const CancelQuestion = defineCall(builtin.name("questions.cancel"), {
  input: z.strictObject({ id: z.string().uuid() }), output: z.null(),
});
export const QuestionsChanged = builtin.event("questions.changed", {
  schema: z.strictObject({ sessionId: z.string(), agentId: z.string(), version: z.number().int().nonnegative() }),
  source: "plugin", semantics: { kind: "snapshot", key: ["sessionId", "agentId"] },
});
export type PendingQuestion = z.infer<typeof pendingQuestionSchema>;
export type QuestionSnapshot = z.infer<typeof questionSnapshotSchema>;
export type Answer = z.infer<typeof AskUserResult.schema>;
