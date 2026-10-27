import type { RequestTiming, Usage } from "@asterism-app/sdk/contracts";
import type { DiagnosticRequest } from "./history";

export const rateKeys = ["output", "nonReasoning", "reasoning", "total", "streaming"] as const;
export type RateKey = typeof rateKeys[number];
type RateSample = { tokens: number; durationMs: number };
const quantity = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value) && value >= 0;

export const requestTiming = (request: DiagnosticRequest) => request.completion?.timing;

export function outputDuration(timing: RequestTiming | undefined): number | null {
  if (!timing || timing.firstOutputMs === null || timing.lastOutputMs === null) return null;
  const duration = timing.lastOutputMs - timing.firstOutputMs;
  return duration >= 0 ? duration : null;
}

/** A rate's numerator and denominator must come from the same complete measurement; missing data is not treated as zero. */
export function rateSamples(timing: RequestTiming | undefined, usage: Usage | null): Record<RateKey, RateSample | null> {
  const samples: Record<RateKey, RateSample | null> = { output: null, nonReasoning: null, reasoning: null, total: null, streaming: null };
  if (!timing || timing.outcome !== "completed" || !(timing.durationMs > 0) || !usage) return samples;
  const sample = (tokens: number): RateSample => ({ tokens, durationMs: timing.durationMs });
  if (quantity(usage.output)) {
    samples.output = sample(usage.output);
    if (quantity(usage.input)) samples.total = sample(usage.input + usage.output);
    if (quantity(usage.reasoning) && usage.reasoning <= usage.output) {
      samples.reasoning = sample(usage.reasoning);
      samples.nonReasoning = sample(usage.output - usage.reasoning);
    }
    const duration = outputDuration(timing);
    // Only when the provider explicitly reports no thinking and none was observed does total output match the visible reception interval.
    // The first packet may contain multiple tokens, so subtracting one token mechanically is invalid; the rate is always labeled an estimate.
    if (usage.output > 0 && usage.reasoning === 0 && timing.firstReasoningMs === null
      && timing.outputChunks > 1 && duration !== null && duration > 0)
      samples.streaming = { tokens: usage.output, durationMs: duration };
  }
  return samples;
}

export function tokensPerSecond(sample: RateSample | null): number | null {
  if (!sample || !(sample.durationMs > 0)) return null;
  const rate = sample.tokens / sample.durationMs * 1000;
  return Number.isFinite(rate) ? rate : null;
}

/** Each metric aggregates only requests with complete data for that metric, without averaging individual TPS values. */
export function performanceOverview(requests: readonly DiagnosticRequest[]) {
  let durationMs = 0, timed = 0;
  const rates = Object.fromEntries(rateKeys.map(key => [key, { tokens: 0, durationMs: 0, count: 0 }])) as Record<RateKey, RateSample & { count: number }>;
  for (const request of requests) {
    const timing = requestTiming(request);
    if (timing) { durationMs += timing.durationMs; timed++; }
    const samples = rateSamples(timing, request.completion?.usage ?? null);
    for (const key of rateKeys) {
      const sample = samples[key];
      if (sample) {
        rates[key].tokens += sample.tokens;
        rates[key].durationMs += sample.durationMs;
        rates[key].count++;
      }
    }
  }
  return { durationMs, timed, rates };
}
