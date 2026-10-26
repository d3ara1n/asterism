import { z } from "zod";
import { withValues, type UsageItem } from "@asterism/sdk/contracts";
import { jsonUsage, parseUsageResponse, timestamp } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const window = z.object({ percent: z.number().min(0).max(100), resetsAt: timestamp.nullish() });
const response = z.object({ usage: z.object({ rolling: window.nullish(), weekly: window.nullish(), monthly: window.nullish() }) });
/** Go 返回已用百分比；自然月没有固定毫秒长度，不以 30 天伪造周期。 */
export function parseOpenCodeQuota(raw: unknown): UsageItem[] {
  const { usage } = parseUsageResponse(response, raw);
  const windows = [
    { id: "rolling" as const, label: withValues(messages.hours, { count: 5 }), durationMs: 18_000_000 },
    { id: "weekly" as const, label: withValues(messages.weeks, { count: 1 }), durationMs: 604_800_000 },
    { id: "monthly" as const, label: withValues(messages.months, { count: 1 }), durationMs: null },
  ];
  return windows.flatMap(({ id, label, durationMs }) => {
    const value = usage[id];
    return value ? [{ id, label, type: "quota" as const, scope: "plan" as const,
      value: { type: "ratio" as const, remaining: (100 - value.percent) / 100 },
      window: { mode: id === "rolling" ? "rolling" as const : "fixed" as const, durationMs, resetAt: value.resetsAt ?? null } }] : [];
  });
}
export const createOpenCodeUsage = (transport: typeof fetch = fetch) => jsonUsage({
  id: "opencode-plan", label: "OpenCode Go", path: "/zen/go/v1/usage", parse: parseOpenCodeQuota,
}, transport);
