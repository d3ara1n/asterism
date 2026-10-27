import type { SessionRecord } from "@asterism/sdk/contracts";
import { ContextSummary } from "@asterism/builtin-api/contracts";

export interface HistoryBoundary { summaryId: string; keptFrom: string }

/** The reading boundary is retained with the Agent in frontend memory; appended summaries add markers only, and the boundary is reevaluated on reload or an explicit path switch. */
export class ConversationHistoryWindow {
  private initialized = false;
  private tip: string | null = null;
  private boundary: HistoryBoundary | null = null;

  read(path: readonly SessionRecord[], agentId: string): HistoryBoundary | null {
    if (!this.initialized || (this.tip !== null && !path.some(record => record.id === this.tip))) {
      this.boundary = null;
      for (const record of path) {
        if (record.source?.resource?.id !== agentId) continue;
        const summary = ContextSummary.decode(record);
        if (summary?.status === "known") this.boundary = { summaryId: record.id, keptFrom: summary.data.keptFrom };
      }
      this.initialized = true;
    }
    this.tip = path.at(-1)?.id ?? null;
    return this.boundary;
  }
}
