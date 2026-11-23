import { usageSubjectSchema, type UsageSubject } from "@asterism-app/sdk/contracts";
import type { UsageSubjectRecord } from "./types.ts";

/** Validate a plugin-declared subject at the SDK boundary and stamp the declaring plugin. */
export function declaredSubject(subject: UsageSubject, declaredBy: string): UsageSubjectRecord | undefined {
  const parsed = usageSubjectSchema.safeParse(subject);
  if (!parsed.success) {
    console.warn(`Invalid usage subject from ${declaredBy}: ${parsed.error.issues.map(issue => issue.message).join("; ")}`);
    return;
  }
  const { kind, id, source, relation, part, quantity } = parsed.data;
  return { kind, id, source: source ?? null, relation, part: part ?? null, quantity: quantity ?? null, declaredBy };
}

/** Evaluate declarations without making usage reporting part of request preparation. */
export function declaredSubjects(usage: readonly UsageSubject[] | (() => readonly UsageSubject[]) | undefined, owner: string): UsageSubjectRecord[] {
  try {
    return (typeof usage === "function" ? usage() : usage ?? []).map(subject => declaredSubject(subject, owner)).filter(record => record !== undefined);
  } catch (error) {
    console.warn(`Usage declaration failed for ${owner}.`, error);
    return [];
  }
}
