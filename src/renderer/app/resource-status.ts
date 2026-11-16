import type { ResourceNotice, ResourceRef } from "@asterism-app/sdk/contracts";

export type ResourceNoticeMark = ResourceNotice & {
  resource: ResourceRef;
};

/** Severity selects only the notification summary; every resource and kind remains in the details. */
export function summarizeResourceNotices(notices: readonly ResourceNoticeMark[]): ResourceNotice["kind"] | undefined {
  return (["error", "attention", "success"] as const)
    .find(kind => notices.some(notice => notice.kind === kind));
}
