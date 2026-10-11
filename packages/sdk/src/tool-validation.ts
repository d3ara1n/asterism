import type { z } from "zod";

/** 保留字段路径和 union 分支的具体校验原因，供模型修正原始 JSON 参数。 */
export function validationMessage(error: z.ZodError, field: string): string {
  const format = (issues: readonly z.core.$ZodIssue[]): string => issues.map(issue => {
    const path = [field, ...issue.path.map(String)].filter(Boolean).join(".");
    return issue.code === "invalid_union"
      ? `${path}: must match one of these alternatives: ${issue.errors.map(branch => `(${format(branch)})`).join(" OR ")}`
      : `${path}: ${issue.message}`;
  }).join("; ");
  return format(error.issues);
}

export const jsonArgumentHint = "Pass target and args as JSON values matching their schemas, not JSON-encoded strings (for example, target: {\"path\":\"subdir\"}, target: null, args: {}).";
