import { answerIssue } from "./answers.ts";
import type { Question, StructuredAnswer, Submission } from "./contract.ts";

export interface SummaryOption { id: string; label: string; recommended: boolean }
/** 复核与结果共用的只读行：已选项、自行填写的文字和未选项分开呈现。 */
export interface SummaryRow {
  id: string;
  question: string;
  type: Question["type"];
  status: "answered" | "skipped" | "pending";
  selected: SummaryOption[];
  /** 文本题的回答或选择题的自定义答案。 */
  text?: string;
  /** 历史结果中的逐题补充。 */
  comment?: string;
  /** 原提问可知时列出未选项；文本题与缺少原提问的历史结果为空。 */
  others: SummaryOption[];
}

function options(question: Question | undefined, selected: (id: string) => boolean): SummaryOption[] {
  if (!question || question.type === "text") return [];
  return question.options.filter(option => selected(option.id))
    .map(option => ({ id: option.id, label: option.label, recommended: question.recommendation?.optionId === option.id }));
}

/** 草稿复核：校验未通过的题显示为待回答，与提交校验使用同一规则。 */
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

/** 终结结果：答案记录题目与所选项原文；原提问仅补充未选项和推荐标记，缺失时按答案原样展示。 */
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
