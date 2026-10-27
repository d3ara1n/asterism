import { answerIssue } from "./answers.ts";
import type { Question, StructuredAnswer, Submission } from "./contract.ts";

export interface SummaryOption { id: string; label: string; recommended: boolean }
/** Read-only rows shared by review and results: selected options, custom text, and unselected options are presented separately. */
export interface SummaryRow {
  id: string;
  question: string;
  type: Question["type"];
  status: "answered" | "skipped" | "pending";
  selected: SummaryOption[];
  /** A text-question answer or a custom answer to a choice question. */
  text?: string;
  /** Per-question supplementary comments in historical results. */
  comment?: string;
  /** Lists unselected options when the original question is known; empty for text questions and historical results without the original question. */
  others: SummaryOption[];
}

function options(question: Question | undefined, selected: (id: string) => boolean): SummaryOption[] {
  if (!question || question.type === "text") return [];
  return question.options.filter(option => selected(option.id))
    .map(option => ({ id: option.id, label: option.label, recommended: question.recommendation?.optionId === option.id }));
}

/** Draft review: questions that fail validation appear as unanswered, using the same rules as submission validation. */
export function submissionRows(questions: Question[], submission: Submission): SummaryRow[] {
  return questions.map((question, index) => {
    const answer = submission.answers[index];
    const base = { id: question.id, question: question.question, type: question.type };
    if (answer?.status === "skipped") return { ...base, status: "skipped", selected: [], others: [] };
    if (!answer || answerIssue(question, answer)) return { ...base, status: "pending", selected: [], others: [] };
    return {
      ...base, status: "answered",
      selected: options(question, id => answer.selected.includes(id)),
      ...(answer.text ? { text: answer.text } : {}),
      others: options(question, id => !answer.selected.includes(id)),
    };
  });
}

/** Final result: answers record original question and selected-option text; original questions only add unselected options and recommendation markers. When missing, show answers as recorded. */
export function resultRows(questions: Question[] | null, result: StructuredAnswer): SummaryRow[] {
  return result.answers.map(answer => {
    const question = questions?.find(item => item.id === answer.id && item.type === answer.type);
    const base = { id: answer.id, question: answer.question, type: answer.type };
    if (answer.status === "skipped") return { ...base, status: "skipped", selected: [], others: [] };
    const chosen = new Set(answer.selected.map(option => option.id));
    const recommended = question && question.type !== "text" ? question.recommendation?.optionId : undefined;
    return {
      ...base, status: "answered",
      selected: answer.selected.map(option => ({ id: option.id, label: option.label, recommended: option.id === recommended })),
      ...(answer.text ? { text: answer.text } : {}),
      ...(answer.comment ? { comment: answer.comment } : {}),
      others: options(question, id => !chosen.has(id)),
    };
  });
}
