import { COMPRESSION_RESERVE } from "../context-budget.ts";
import type { DiagnosticRequest } from "./history.ts";
import { cacheUsage } from "./usage";

export interface TrendPoint {
  id: string; sequence: number; input: number; cacheRead: number | null;
  /** Exact input difference from the previous request; null when the model or system snapshot differs, or compression intervenes. */
  delta: number | null;
}
export interface CompressionEntry { id: string; createdAt: string; sequence: number; tokensBefore: number | null; after: number | null }
export interface DiagnosticOverview {
  /** Counts only work requests; compression summary input is separate summary material and does not represent agent context. */
  cache: { read: number; input: number } | null;
  trend: TrendPoint[];
  compressions: CompressionEntry[];
  headroom: { input: number; window: number; threshold: number; remaining: number } | "compressed" | "unknown" | null;
}

const sameSnapshot = (a: DiagnosticRequest, b: DiagnosticRequest) =>
  a.sent !== null && b.sent !== null && a.modelScope === b.modelScope && a.model === b.model
  && JSON.stringify([a.sent.system, a.sent.tools]) === JSON.stringify([b.sent.system, b.sent.tools]);

/** All values come from saved reported usage and request diagnostics; trend, compressions, and headroom are meaningful only for a single path. */
export function diagnosticOverview<R extends DiagnosticRequest>(requests: readonly R[], windowOf: (request: R) => number | null): DiagnosticOverview {
  const ordered = [...requests].sort((a, b) => a.sequence - b.sequence);
  const work = ordered.filter(request => request.kind === "response" && request.completion?.usage?.input != null);
  const compressions = ordered.filter(request => request.kind === "compression");
  const cached = cacheUsage(ordered);
  const cache = cached ? { read: cached.read, input: cached.input } : null;
  const trend = work.map((request, index): TrendPoint => {
    const previous = work[index - 1];
    const comparable = previous && sameSnapshot(previous, request)
      && !compressions.some(item => item.sequence > previous.sequence && item.sequence < request.sequence);
    const input = request.completion!.usage!.input!;
    return { id: request.id, sequence: request.sequence, input, cacheRead: request.completion!.usage!.cacheRead,
      delta: comparable ? input - previous.completion!.usage!.input! : null };
  });
  const entries = compressions.map((request): CompressionEntry => ({
    id: request.id, createdAt: request.createdAt, sequence: request.sequence, tokensBefore: request.tokensBefore,
    after: trend.find(point => point.sequence > request.sequence)?.input ?? null,
  }));
  const latest = work.at(-1);
  let headroom: DiagnosticOverview["headroom"] = null;
  if (latest) {
    const window = windowOf(latest);
    if (compressions.some(item => item.sequence > latest.sequence)) headroom = "compressed";
    else if (!window) headroom = "unknown";
    else {
      const input = latest.completion!.usage!.input!, threshold = Math.max(window - COMPRESSION_RESERVE, 0);
      headroom = { input, window, threshold, remaining: threshold - input };
    }
  }
  return { cache, trend, compressions: entries, headroom };
}
