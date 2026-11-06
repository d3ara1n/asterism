import { z } from "zod";
import type { UsageItem } from "@asterism-app/sdk/contracts";
import { jsonUsage, parseUsageResponse, timestamp } from "./usage-http.ts";

const window = z.object({ percent: z.number().min(0).max(100), resetsAt: timestamp.nullish() });
const response = z.object({ usage: z.object({ rolling: window.nullish(), weekly: window.nullish(), monthly: window.nullish() }) });
/** Go returns the percentage used for its five-hour, weekly, and monthly windows; the monthly window counts as 30 days. */
export function parseOpenCodeQuota(raw: unknown): UsageItem[] {
  const { usage } = parseUsageResponse(response, raw);
  const windows = [
    { id: "rolling" as const, periodSeconds: 18_000 },
    { id: "weekly" as const, periodSeconds: 604_800 },
    { id: "monthly" as const, periodSeconds: 2_592_000 },
  ];
  return windows.flatMap(({ id, periodSeconds }) => {
    const value = usage[id];
    return value ? [{ id, type: "quota" as const, scope: "plan" as const,
      value: { type: "ratio" as const, remaining: (100 - value.percent) / 100 },
      window: { mode: id === "rolling" ? "rolling" as const : "fixed" as const, periodSeconds, resetAt: value.resetsAt ?? null } }] : [];
  });
}
export const createOpenCodeUsage = (transport: typeof fetch = fetch) => jsonUsage({
  id: "opencode-plan", label: "OpenCode Go", path: "/zen/go/v1/usage", parse: parseOpenCodeQuota,
}, transport);
