import type { SessionRecord } from "@atelier/sdk/contracts";
import { ContextSummary } from "@atelier/builtin-api/contracts";

export interface HistoryBoundary { summaryId: string; keptFrom: string }

/** 阅读边界随 Agent 在前端内存中保留；追加的新摘要只加标记，重新载入或显式换路径时重新取用。 */
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
