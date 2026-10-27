import { describe, expect, it } from "vitest";
import type { AgentRequestContextData } from "@asterism/builtin-api/contracts";
import { COMPRESSION_RESERVE } from "../context-budget.ts";
import type { DiagnosticRequest } from "./history.ts";
import { diagnosticOverview } from "./overview.ts";

const sent: AgentRequestContextData = { system: [{ kind: "system", from: "builtin", characters: 10 }], tools: ["resource_list"] };
function request(sequence: number, input: number | null, extra: Partial<DiagnosticRequest> = {}): DiagnosticRequest {
  return {
    id: `r${sequence}`, kind: "response", responseId: `r${sequence}`, model: "p/m", modelScope: "scope", createdAt: "2026-10-15T10:00:00Z",
    sequence, requestParentId: null, blocks: [], summary: null, onTimeline: true, relatedInput: null, inputHasFiles: false,
    tokensBefore: null, sent,
    completion: input === null ? null : { finishReason: "stop", rawFinishReason: null, providerResponseId: null,
      usage: { input, output: 1, total: input + 1, reasoning: null, cacheRead: Math.floor(input / 2), cacheWrite: null } },
    ...extra,
  };
}
const compression = (sequence: number, tokensBefore: number) => request(sequence, 50, {
  id: `s${sequence}`, kind: "compression", responseId: null, sent: null, tokensBefore,
});

// Use only reported usage; deltas are valid only when model and system snapshots match and no compression intervenes.
describe("Diagnostic overview", () => {
  it("Provides deltas only between comparable adjacent requests and pairs compression history with the next reported input", () => {
    const requests = [
      request(1, 1000), request(2, 1500),
      request(3, 1800, { sent: { ...sent, tools: ["resource_list", "resource_call"] } }),
      compression(4, 1900), request(5, 600), request(6, 700, { sent: null }),
    ];
    const { trend, compressions } = diagnosticOverview(requests.reverse(), () => null);
    expect(trend.map(point => [point.input, point.delta])).toEqual([[1000, null], [1500, 500], [1800, null], [600, null], [700, null]]);
    expect(compressions).toEqual([expect.objectContaining({ tokensBefore: 1900, after: 600 })]);
  });

  it("Cache hits include only work requests; headroom after compression does not reuse old input", () => {
    const window = 100_000;
    const open = diagnosticOverview([request(1, 1000), compression(2, 900), request(3, 4000)], () => window);
    expect(open.cache).toEqual({ read: 500 + 2000, input: 5000 });
    expect(open.headroom).toEqual({ input: 4000, window, threshold: window - COMPRESSION_RESERVE, remaining: window - COMPRESSION_RESERVE - 4000 });
    expect(diagnosticOverview([request(1, 1000), compression(2, 900)], () => window).headroom).toBe("compressed");
    expect(diagnosticOverview([request(1, 1000)], () => null).headroom).toBe("unknown");
    expect(diagnosticOverview([request(1, null)], () => window)).toMatchObject({ cache: null, trend: [], headroom: null });
  });
});
