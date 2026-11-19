import type { ResourceActivity, ResourceNotice, ResourceRef } from "@asterism-app/sdk/contracts";

export type ResourceNoticeMark = ResourceNotice & {
  resource: ResourceRef;
};

/** Severity selects only the notification summary; every resource and kind remains in the details. */
export function summarizeResourceNotices(notices: readonly ResourceNoticeMark[]): ResourceNotice["kind"] | undefined {
  return (["error", "attention", "success"] as const)
    .find(kind => notices.some(notice => notice.kind === kind));
}

export type SessionResourceState = { kind: ResourceNotice["kind"] } | { kind: "running"; progress: number | null };

export type SessionIndicator = {
  /** One slot: an unviewed notice covers running work until viewing consumes it, then running shows again. */
  state: SessionResourceState | null;
  /** Open instances keep holding machine resources until closed; running work is reported by state instead. */
  instances: number;
};

type WorkActivity = Extract<ResourceActivity, { kind: "work" }>;

export function sessionIndicator(activities: readonly ResourceActivity[], notices: readonly ResourceNoticeMark[]): SessionIndicator {
  const work = activities.filter((activity): activity is WorkActivity => activity.kind === "work");
  const instances = activities.length - work.length;
  const notice = summarizeResourceNotices(notices);
  if (notice) return { state: { kind: notice }, instances };
  if (work.length === 0) return { state: null, instances };
  // Combined progress is known only when every running activity reports it; the slowest one bounds completion.
  const progress = work.every(activity => activity.progress) ? Math.min(...work.map(activity => activity.progress!.value)) : null;
  return { state: { kind: "running", progress }, instances };
}
