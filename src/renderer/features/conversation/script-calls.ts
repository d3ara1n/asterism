import type { ScriptCall } from "../../../tools/core";
import { toolOutcomeTone, type ToolOutcomeKind } from "@asterism-app/ui/tool-outcome";

export interface ScriptCallGroup {
  key: string;
  /** First call of the group; carries the shared tool and resource identity. */
  call: ScriptCall;
  count: number;
  running: number;
  queued: number;
  /** Settled calls per outcome. */
  settled: Partial<Record<ToolOutcomeKind, number>>;
  /** Most severe settled outcome; null while no call has settled. */
  worst: ToolOutcomeKind | null;
  startedAt?: number;
  /** Latest finish; absent while any call in the group is running. */
  finishedAt?: number;
  /** Distinct diagnostics in first-occurrence order. */
  diagnostics: string[];
}

const severity: Record<ToolOutcomeKind, number> = { failed: 5, rejected: 4, unknown: 3, partial: 2, cancelled: 1, succeeded: 0 };

/** Detail rows group by resource; header summaries combine resources under the same tool identity. */
export function groupScriptCalls(calls: readonly ScriptCall[], scope: "resource" | "tool" = "resource"): ScriptCallGroup[] {
  const groups = new Map<string, ScriptCallGroup>();
  for (const call of calls) {
    const key = JSON.stringify([call.name, call.tool ?? null, call.implementation?.id ?? null, scope === "resource" ? call.resource?.id ?? null : null]);
    let group = groups.get(key);
    if (!group) groups.set(key, group = { key, call, count: 0, running: 0, queued: 0, settled: {}, worst: null, diagnostics: [] });
    group.count++;
    if (call.startedAt !== undefined) group.startedAt = Math.min(group.startedAt ?? call.startedAt, call.startedAt);
    if (call.finishedAt !== undefined) group.finishedAt = Math.max(group.finishedAt ?? call.finishedAt, call.finishedAt);
    if (call.kind === "queued") group.queued++;
    else if (call.kind === "running") group.running++;
    else {
      group.settled[call.kind] = (group.settled[call.kind] ?? 0) + 1;
      if (group.worst === null || severity[call.kind] > severity[group.worst]) group.worst = call.kind;
      const diagnostic = call.error?.message ?? call.message;
      if (diagnostic && !group.diagnostics.includes(diagnostic)) group.diagnostics.push(diagnostic);
    }
  }
  const result = [...groups.values()];
  for (const group of result) if (group.running) delete group.finishedAt;
  return result;
}

/** Header totals: all calls, settled calls, and settled calls whose outcome reads as an error or a warning. */
export function scriptCallTotals(calls: readonly ScriptCall[]) {
  let settled = 0, failed = 0, partial = 0;
  for (const call of calls) {
    if (call.kind === "queued" || call.kind === "running") continue;
    settled++;
    const tone = toolOutcomeTone(call.kind);
    if (tone === "error") failed++;
    else if (tone === "warning") partial++;
  }
  return { total: calls.length, settled, failed, partial };
}
