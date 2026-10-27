import type { Json } from "@asterism-app/sdk/contracts";

/** Partial arguments consume only question text already present, shared by body rendering and preview-stage detection. */
export function questionTitles(args: Json): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  if (typeof args.question === "string") return [args.question];
  if (!Array.isArray(args.questions)) return [];
  return args.questions.flatMap(question => question && typeof question === "object" && !Array.isArray(question)
    && typeof question.question === "string" ? [question.question] : []);
}
