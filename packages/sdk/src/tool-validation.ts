import { z } from "zod";

type IssueDetail = (issue: z.core.$ZodIssue, path: readonly PropertyKey[]) => string | undefined;

function formatIssues(issues: readonly z.core.$ZodIssue[], parent: readonly PropertyKey[], detail?: IssueDetail): string {
  return issues.map(issue => {
    const path = [...parent, ...issue.path];
    return detail?.(issue, path) ?? (issue.code === "invalid_union"
      ? `${path.map(String).join(".")}: must match one of these alternatives: ${issue.errors.map(branch => `(${formatIssues(branch, path, detail)})`).join(" OR ")}`
      : `${path.map(String).join(".")}: ${issue.message}`);
  }).join("; ");
}

/** Preserve field paths and specific validation reasons from union branches so the model can correct the raw JSON arguments. */
export function validationMessage(error: z.ZodError, field: string): string {
  return formatIssues(error.issues, field ? [field] : []);
}

function declaresRootField(schema: z.core.$ZodType, key: string): boolean {
  if (schema instanceof z.ZodObject) return Object.hasOwn(schema.shape, key);
  if (schema instanceof z.ZodNullable) return declaresRootField(schema.unwrap(), key);
  if (schema instanceof z.ZodUnion) {
    // A hint must not depend on guessing which object variant the caller intended.
    const variants = schema.options.filter(option => !(option instanceof z.ZodNull));
    return variants.length > 0 && variants.every(option => declaresRootField(option, key));
  }
  return false;
}

/** Format a resource input error parsed with reportInput, without including raw input values in the hints. */
export function resourceValidationMessage(error: z.ZodError, field: "args" | "target", otherSchema: z.ZodType): string {
  const other = field === "args" ? "target" : "args";
  return formatIssues(error.issues, [field], (issue, path) => {
    if (issue.code === "unrecognized_keys") return issue.keys.map(key => {
      const at = [...path, key].map(String).join(".");
      return path.length === 1 && declaresRootField(otherSchema, key)
        ? `${at}: Not accepted here. This tool implementation declares it as ${other}.${key}.`
        : `${at}: Unknown field at this location for this tool implementation.`;
    }).join("; ");
    if (path.length > 1 && issue.input === undefined &&
      (issue.code === "invalid_type" || issue.code === "invalid_value" || issue.code === "invalid_union"))
      return `${path.map(String).join(".")}: Required field is missing.`;
  });
}

export const jsonArgumentHint = 'target and args are JSON objects or null matching their schemas.';
