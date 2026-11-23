import { usageSubjectSchema, type UsageSubject } from "@asterism-app/sdk/contracts";
import { PluginApiError } from "@asterism-app/sdk/runtime";
import type { UsageSubjectRecord } from "./types.ts";

/** Validate a plugin-declared subject at the SDK boundary and stamp the declaring plugin. */
export function declaredSubject(subject: UsageSubject, declaredBy: string): UsageSubjectRecord {
  const parsed = usageSubjectSchema.safeParse(subject);
  if (!parsed.success) throw new PluginApiError("invalid_argument", `Invalid usage subject: ${parsed.error.issues.map(issue => issue.message).join("; ")}`);
  const { kind, id, source, relation, part, quantity } = parsed.data;
  return { kind, id, source: source ?? null, relation, part: part ?? null, quantity: quantity ?? null, declaredBy };
}
