import type { z } from "zod";

/** Preserve field paths and specific validation reasons from union branches so the model can correct the raw JSON arguments. */
export function validationMessage(error: z.ZodError, field: string): string {
  const format = (issues: readonly z.core.$ZodIssue[]): string => issues.map(issue => {
    const path = [field, ...issue.path.map(String)].filter(Boolean).join(".");
    return issue.code === "invalid_union"
      ? `${path}: must match one of these alternatives: ${issue.errors.map(branch => `(${format(branch)})`).join(" OR ")}`
      : `${path}: ${issue.message}`;
  }).join("; ");
  return format(error.issues);
}

export const jsonArgumentHint = "target and args are JSON values matching their schemas; objects and null retain their JSON types.";
