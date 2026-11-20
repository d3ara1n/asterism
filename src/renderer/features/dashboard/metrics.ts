import type { UsageMetrics } from "../../../shared/telemetry";

/** Ratios derived from raw ledger sums; null when the denominator is absent. */
export const cacheHitRate = (m: UsageMetrics) => m.inputTokens > 0 ? m.cacheReadTokens / m.inputTokens : null;
export const successRate = (m: UsageMetrics) => m.requests > 0 ? m.completed / m.requests : null;
/** Output tokens per second after the first output arrived. */
export const outputSpeed = (m: UsageMetrics) => m.generationMs > 0 ? m.generatedTokens / (m.generationMs / 1000) : null;
export const uncachedInput = (m: UsageMetrics) => Math.max(0, m.inputTokens - m.cacheReadTokens - m.cacheWriteTokens);
export const textOutput = (m: UsageMetrics) => Math.max(0, m.outputTokens - m.reasoningTokens);
/** Blended USD per million tokens across input and output. */
export const pricePerMillion = (m: UsageMetrics) => m.totalTokens > 0 && m.costUsd > 0 ? m.costUsd / m.totalTokens * 1_000_000 : null;
/** Relative change from the previous value; null when there is nothing to compare against. */
export const change = (current: number, previous: number | undefined) => previous === undefined || previous <= 0 ? null : (current - previous) / previous;

export type Measure = "costUsd" | "totalTokens" | "requests";
export const measureOf = (m: Pick<UsageMetrics, Measure>, measure: Measure) => m[measure];
