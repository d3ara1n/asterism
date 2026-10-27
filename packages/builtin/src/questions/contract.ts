import { z } from "zod";
import { defineCall } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

const text = z.string().trim().min(1);
const optionSchema = z.strictObject({
  id: text.describe("Stable option ID, unique within this question."),
  label: text.describe("Short option label in the user's language."),
  description: text.optional().describe("Brief explanation of the meaningful differences or tradeoffs."),
  detail: text.optional().describe("Optional Markdown detail, only when needed to make an informed choice. Supports tables and code."),
});
const common = {
  id: text.describe("Stable question ID, unique within this call; returned with the answer."),
  question: text.describe("The complete, concise question in the user's language."),
  label: text.optional().describe("Optional short navigation label for a group of questions."),
  context: text.optional().describe("Optional Markdown background for the question."),
  required: z.boolean().default(true).describe("Whether an answer is required for submission. Optional questions may be left blank and return skipped. Default true."),
};
const choice = {
  options: z.array(optionSchema).min(2).describe("Distinct choices. The interface also provides a custom input option."),
  recommendation: z.strictObject({
    optionId: text.describe("ID of the option presented as a recommendation."),
    reason: text.describe("Brief reason for the recommendation, shown to the user."),
  }).optional().describe("Optional recommendation, with an explicit reason."),
};
export const questionSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...common, type: z.literal("single").describe("Choose one option or supply a custom answer."), ...choice }),
  z.strictObject({ ...common, type: z.literal("multiple").describe("Choose several options and/or add a custom answer."), ...choice }),
  z.strictObject({ ...common, type: z.literal("text").describe("Write a free-form answer; no options.") }),
]).superRefine((question, ctx) => {
  if (question.type === "text") return;
  if (new Set(question.options.map(option => option.id)).size !== question.options.length)
    ctx.addIssue({ code: "custom", path: ["options"], message: "Option IDs must be unique within a question." });
  if (question.recommendation && !question.options.some(option => option.id === question.recommendation!.optionId))
    ctx.addIssue({ code: "custom", path: ["recommendation", "optionId"], message: "Recommendation must reference an offered option." });
});
export const askUserArgs = z.strictObject({
  questions: z.array(questionSchema).min(1).describe("Questions presented together in one group."),
}).superRefine((args, ctx) => {
  if (new Set(args.questions.map(question => question.id)).size !== args.questions.length)
    ctx.addIssue({ code: "custom", path: ["questions"], message: "Question IDs must be unique within a call." });
}).describe("Ask for decisions or missing information, with single choice, multiple choice or free text.");

export const submittedAnswerSchema = z.discriminatedUnion("status", [
  z.strictObject({ id: text, status: z.literal("skipped") }),
  z.strictObject({
    id: text, status: z.literal("answered"), selected: z.array(text),
    text: text.optional(),
  }),
]);
export const submissionSchema = z.strictObject({ answers: z.array(submittedAnswerSchema), message: text.optional() });
const answerSchema = z.strictObject({
  id: text.describe("Original question ID."),
  question: text.describe("Original question text."),
  type: z.enum(["single", "multiple", "text"]).describe("Original question type."),
  status: z.enum(["answered", "skipped"]).describe("Explicit user response state."),
  selected: z.array(z.strictObject({ id: text, label: text })).describe("User-selected options, with original IDs and labels."),
  text: text.optional().describe("The user's custom answer, verbatim except outer whitespace."),
  comment: text.optional().describe("Legacy per-question comment, retained when reading existing results."),
});
export const structuredAnswerSchema = z.strictObject({
  answers: z.array(answerSchema).describe("Answers in original question order."),
  message: text.optional().describe("User-authored overall correction or additional instructions. Interpret together with the answers."),
});
// Read-only compatibility for historical results; new calls always use structured questions and answers.
export const AskUserResult = builtin.data("ask-user", z.union([
  structuredAnswerSchema,
  z.strictObject({ requestId: text.describe("Identity of the currently waiting question group; only published during execution.") }),
  z.strictObject({ answer: z.string().describe("Legacy text answer.") }),
]).describe("The user's submitted answers and qualifications. Cancellation is a separate tool outcome."));
export const pendingQuestionSchema = z.strictObject({
  id: z.string().uuid(), callId: z.string(), questions: z.array(questionSchema),
});
export const AnswerQuestion = defineCall(builtin.name("questions.answer"), { scope: "object",
  input: z.strictObject({ id: z.string().uuid(), submission: submissionSchema }), output: z.null(),
});
export const CancelQuestion = defineCall(builtin.name("questions.cancel"), { scope: "object",
  input: z.strictObject({ id: z.string().uuid() }), output: z.null(),
});
export const QuestionsChanged = builtin.event("questions.changed", {
  schema: z.strictObject({
    sessionId: z.string(), agentId: z.string(), pending: z.array(pendingQuestionSchema),
  }),
  source: "plugin", semantics: { kind: "snapshot", key: ["sessionId", "agentId"] },
});
export type Question = z.infer<typeof questionSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type SubmittedAnswer = z.infer<typeof submittedAnswerSchema>;
export type StructuredAnswer = z.infer<typeof structuredAnswerSchema>;
export type PendingQuestion = z.infer<typeof pendingQuestionSchema>;
export type Answer = z.infer<typeof AskUserResult.schema>;
