import type { QuotaItem, UiText, UsageItem } from "@atelier/sdk/contracts";
import { z } from "zod";
import { UsageQueryError, type HeadersUsageProvider, type UsageHeadersContext } from "@atelier/sdk/runtime";
import { usageMessages as messages } from "../messages/usage.ts";

function number(value: string | undefined): number | null {
  if (value === undefined || !/^\d+(?:\.\d+)?$/u.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
/** OpenAI 返回 Go duration；必须整串匹配，不能把未知字符串中的数字当重置时间。 */
function duration(value: string | undefined): number | null {
  if (!value || !/^(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+$/u.test(value)) return null;
  const units: Record<string, number> = { ns: 0.000001, us: 0.001, "µs": 0.001, ms: 1, s: 1000, m: 60000, h: 3600000 };
  const ms = [...value.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/gu)]
    .reduce((total, match) => total + Number(match[1]) * units[match[2]!]!, 0);
  return Number.isFinite(ms) ? ms : null;
}
const isoTimestamp = z.iso.datetime({ offset: true });
const isoTime = (value: string | undefined): number | null => {
  if (!isoTimestamp.safeParse(value).success) return null;
  const time = Date.parse(value!);
  return Number.isFinite(time) && time >= 0 ? time : null;
};
interface Metric { id: string; label: UiText; unit: UiText; limit: string; remaining: string; reset: string }
function parse(context: UsageHeadersContext, metrics: readonly Metric[], reset: (value: string | undefined, receivedAt: number) => number | null): UsageItem[] | null {
  const items: QuotaItem[] = [];
  for (const metric of metrics) {
    const rawLimit = context.headers[metric.limit], rawRemaining = context.headers[metric.remaining];
    if (rawLimit === undefined || rawRemaining === undefined) continue;
    const limit = number(rawLimit), remaining = number(rawRemaining);
    if (limit === null || remaining === null || remaining > limit) throw new UsageQueryError("protocol");
    const resetAt = reset(context.headers[metric.reset], context.receivedAt);
    items.push({ id: metric.id, label: metric.label, type: "quota", category: "rate_limit", scope: "connection",
      value: limit === 0 ? { type: "ratio", remaining: 0 } : { type: "quantity", limit, remaining, unit: metric.unit },
      // 重置倒计时是桶恢复时刻，不用它反推完整窗口长度。
      window: { mode: "unknown", durationMs: null,
        resetAt: resetAt !== null && Number.isFinite(new Date(resetAt).getTime()) && resetAt >= 0 ? resetAt : null } });
  }
  return items.length ? items : null;
}
const openaiMetrics: Metric[] = [
  { id: "tokens", label: messages.tokenRate, unit: "tokens", limit: "x-ratelimit-limit-tokens", remaining: "x-ratelimit-remaining-tokens", reset: "x-ratelimit-reset-tokens" },
  { id: "requests", label: messages.requestRate, unit: messages.requests, limit: "x-ratelimit-limit-requests", remaining: "x-ratelimit-remaining-requests", reset: "x-ratelimit-reset-requests" },
];
export const openaiHeaderUsage: HeadersUsageProvider = {
  id: "openai", label: "OpenAI", source: "headers",
  parseHeaders: context => parse(context, [...openaiMetrics,
    { id: "project-tokens", label: messages.projectTokenRate, unit: "tokens", limit: "x-ratelimit-limit-project-tokens", remaining: "x-ratelimit-remaining-project-tokens", reset: "x-ratelimit-reset-project-tokens" },
  ], (value, now) => { const ms = duration(value); return ms === null ? null : now + ms; }),
};
export const anthropicHeaderUsage: HeadersUsageProvider = {
  id: "anthropic", label: "Anthropic", source: "headers",
  parseHeaders: context => parse(context, [
    { id: "tokens", label: messages.tokenRate, unit: "tokens", limit: "anthropic-ratelimit-tokens-limit", remaining: "anthropic-ratelimit-tokens-remaining", reset: "anthropic-ratelimit-tokens-reset" },
    { id: "input-tokens", label: messages.inputTokenRate, unit: "tokens", limit: "anthropic-ratelimit-input-tokens-limit", remaining: "anthropic-ratelimit-input-tokens-remaining", reset: "anthropic-ratelimit-input-tokens-reset" },
    { id: "output-tokens", label: messages.outputTokenRate, unit: "tokens", limit: "anthropic-ratelimit-output-tokens-limit", remaining: "anthropic-ratelimit-output-tokens-remaining", reset: "anthropic-ratelimit-output-tokens-reset" },
    { id: "requests", label: messages.requestRate, unit: messages.requests, limit: "anthropic-ratelimit-requests-limit", remaining: "anthropic-ratelimit-requests-remaining", reset: "anthropic-ratelimit-requests-reset" },
  ], isoTime),
};
export const xaiHeaderUsage: HeadersUsageProvider = {
  id: "xai", label: "xAI", source: "headers",
  parseHeaders: context => parse(context, openaiMetrics, (value, now) => {
    const ms = duration(value);
    if (ms !== null) return now + ms;
    // 已知实现分别报告 Unix 秒/毫秒；小整数不能确定是相对秒数还是时间戳，保持未知。
    if (value && /^\d{10}(?:\.\d+)?$/u.test(value)) return Number(value) * 1000;
    if (value && /^\d{13}$/u.test(value)) return Number(value);
    return null;
  }),
};
