import type { ResourceRef, ResourceStatus } from "@asterism/sdk/contracts";

export type ResourceStatusMark = ResourceStatus & {
  resource: ResourceRef;
};

/** 汇总只选择概要；不同资源的条目始终保留在详情中。 */
export function summarizeResourceStatus(marks: readonly ResourceStatusMark[]): ResourceStatus["status"] | undefined {
  return (["failed", "awaiting", "running", "completed"] as const)
    .find(status => marks.some(mark => mark.status === status));
}
