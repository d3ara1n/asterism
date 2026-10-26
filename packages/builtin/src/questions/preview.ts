import type { Json } from "@asterism/sdk/contracts";

/** 部分参数只消费已出现的问题文字，供正文与预览阶段识别共用。 */
export function questionTitles(args: Json): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  if (typeof args.question === "string") return [args.question];
  if (!Array.isArray(args.questions)) return [];
  return args.questions.flatMap(question => question && typeof question === "object" && !Array.isArray(question)
    && typeof question.question === "string" ? [question.question] : []);
}
