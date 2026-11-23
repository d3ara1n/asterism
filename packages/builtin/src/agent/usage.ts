import { usageRelations, usageSubjectKinds, type UsageSubject } from "@asterism-app/sdk/contracts";

/** A conversation input or a delegation identifies the work unit across all its requests. */
export function agentTurnUsage(role: string, instance: string, turn: string | null): UsageSubject {
  return { kind: usageSubjectKinds.workUnit, relation: usageRelations.context, id: role, source: instance, part: turn };
}
