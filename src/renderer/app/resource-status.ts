import type { ResourceRef, ResourceStatus } from "@asterism-app/sdk/contracts";

export type ResourceStatusMark = ResourceStatus & {
  resource: ResourceRef;
};

/** Aggregation selects only the summary; entries from different resources always remain in the details. */
export function summarizeResourceStatus(marks: readonly ResourceStatusMark[]): ResourceStatus["status"] | undefined {
  return (["failed", "awaiting", "running", "completed"] as const)
    .find(status => marks.some(mark => mark.status === status));
}
