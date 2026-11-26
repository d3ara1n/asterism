import { z } from "zod";
import type { QuotaItem } from "@asterism-app/sdk/contracts";
import { UsageQueryError } from "@asterism-app/sdk/runtime";
import { jsonUsage, parseUsageResponse } from "./usage-http.ts";

const count = z.number().nonnegative().nullish();
const percent = z.number().min(0).max(100).nullish();
const response = z.object({
  base_resp: z.object({ status_code: z.number().int() }),
  model_remains: z.array(z.object({
    model_name: z.string(), start_time: count, end_time: count, weekly_start_time: count, weekly_end_time: count,
    current_interval_remaining_percent: percent, current_interval_total_count: count, current_interval_usage_count: count,
    current_weekly_remaining_percent: percent, current_weekly_total_count: count, current_weekly_usage_count: count,
    current_interval_status: count, current_weekly_status: count,
  })).optional(),
});

function quota(id: string, periodSeconds: number, startAt: number | null | undefined, endAt: number | null | undefined,
  status: number | null | undefined, percent: number | null | undefined, total: number | null | undefined,
  count: number | null | undefined): QuotaItem[] {
  if (status === 3) return []; // The API marks unlimited or unavailable windows with this status.
  // The percent is authoritative: depending on the response, usage_count can be consumed or remaining.
  // Without an explicit percentage, the official CLI treats it as a remaining count.
  const remaining = status === 2 ? 0 : percent != null ? percent / 100
    : total != null && total > 0 && count != null && count <= total ? count / total : null;
  if (remaining === null) return [];
  const resetAt = endAt && (startAt == null || endAt > startAt) ? endAt : null;
  return [{ id, type: "quota", scope: "plan", category: "allowance",
    value: { type: "ratio", remaining }, window: { mode: "fixed", periodSeconds, resetAt } }];
}

/** Report only the text allowance, not image, speech, or video quota rows. */
export function parseMiniMaxPlan(raw: unknown): QuotaItem[] {
  const { base_resp, model_remains } = parseUsageResponse(response, raw);
  if (base_resp.status_code !== 0) throw new UsageQueryError(base_resp.status_code === 1004 ? "authentication" : "protocol");
  if (!model_remains) throw new UsageQueryError("protocol");
  const key = (name: string) => name.trim().toLowerCase();
  const model = model_remains.find(row => key(row.model_name) === "minimax-m*")
    ?? model_remains.find(row => /^(general|chat|text)$/.test(key(row.model_name)))
    ?? model_remains.find(row => /^minimax-m\d/.test(key(row.model_name)));
  if (!model) return [];
  return [
    ...quota("five-hour", 18_000, model.start_time, model.end_time, model.current_interval_status,
      model.current_interval_remaining_percent, model.current_interval_total_count, model.current_interval_usage_count),
    ...quota("weekly", 604_800, model.weekly_start_time, model.weekly_end_time, model.current_weekly_status,
      model.current_weekly_remaining_percent, model.current_weekly_total_count, model.current_weekly_usage_count),
  ];
}

export const createMiniMaxUsage = (transport: typeof fetch = fetch) => jsonUsage({
  id: "minimax-plan", label: "MiniMax M Plan", path: "/v1/token_plan/remains", parse: parseMiniMaxPlan,
}, transport);
