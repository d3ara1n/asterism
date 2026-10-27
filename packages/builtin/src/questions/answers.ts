import type { Question, Submission, SubmittedAnswer, StructuredAnswer } from "./contract.ts";

/** Accepts only identities from the current question set; frontend validation and backend acceptance share the same business rules. */
export function answerIssue(question: Question, answer: SubmittedAnswer | undefined): string | null {
  if (!answer) return "An answer or explicit skip is required.";
  if (answer.status === "skipped") return question.required ? "This question cannot be skipped." : null;
  const { selected, text } = answer;
  if (text !== undefined && !text.trim()) return "A selected custom answer or text answer must contain text.";
  if (new Set(selected).size !== selected.length) return "Selected option IDs must be unique.";
  if (question.type === "text") {
    return selected.length || !text?.trim() ? "A text question requires text and cannot select options." : null;
  }
  if (selected.some(id => !question.options.some(option => option.id === id))) return "Selected option does not belong to this question.";
  if (question.type === "single" && selected.length + (text?.trim() ? 1 : 0) !== 1)
    return "Choose exactly one option or supply a custom answer.";
  if (!selected.length && !text?.trim()) return "Choose an option, supply a custom answer, or explicitly skip an optional question.";
  return null;
}

export class AnswerValidationError extends Error {
  constructor(message: string, readonly questionId?: string) { super(message); }
}
export function resolveAnswers(questions: Question[], submission: Submission): StructuredAnswer {
  const ids = new Set(submission.answers.map(answer => answer.id));
  if (ids.size !== submission.answers.length || submission.answers.some(answer => !questions.some(question => question.id === answer.id)))
    throw new AnswerValidationError("Answers must reference unique question IDs from this call.");
  const answers = questions.map(question => {
    const answer = submission.answers.find(answer => answer.id === question.id);
    const issue = answerIssue(question, answer);
    if (issue || !answer) throw new AnswerValidationError(issue ?? "Missing answer.", question.id);
    const identity = { id: question.id, question: question.question, type: question.type };
    if (answer.status === "skipped") return { ...identity, status: "skipped" as const, selected: [] };
    return {
      ...identity, status: "answered" as const,
      selected: question.type === "text" ? [] : question.options.filter(option => answer.selected.includes(option.id)).map(({ id, label }) => ({ id, label })),
      ...(answer.text?.trim() ? { text: answer.text.trim() } : {}),
    };
  });
  return { answers, ...(submission.message?.trim() ? { message: submission.message.trim() } : {}) };
}
