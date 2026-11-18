import type { RecordInfo } from "@asterism-app/sdk/contracts";
import { AgentInputMessage, ContextSummary, executionRecordIds } from "@asterism-app/builtin-api/contracts";

export interface HistoryBoundary { summaryId: string; keptFrom: string }
export interface HistoryRange { boundary: HistoryBoundary | null; from?: string; earlier: boolean }
const historyPageSize = 100;
export const conversationRecordIds: readonly string[] = [AgentInputMessage.id, ContextSummary.id, ...executionRecordIds];

/** The reading boundary is retained with the Agent in frontend memory; appended summaries add markers only, and the boundary is reevaluated on reload or an explicit path switch. */
export class ConversationHistoryWindow {
  private initialized = false;
  private tip: string | null = null;
  private boundary: HistoryBoundary | null = null;
  private from: string | undefined;

  constructor(readonly agentId: string) {}

  observe(path: readonly RecordInfo[], summary: HistoryBoundary | null): HistoryRange {
    if (!this.initialized || (this.tip !== null && !path.some(record => record.id === this.tip))) {
      this.boundary = summary;
      this.from = undefined;
      this.initialized = true;
    }
    this.tip = path.at(-1)?.id ?? null;
    const boundary = this.lowerBound(path);
    this.from ??= path[this.pageStart(path, boundary, path.length)]?.id;
    const start = this.from ? path.findIndex(record => record.id === this.from) : boundary;
    return { boundary: this.boundary, from: this.from, earlier: start > boundary };
  }

  /** Independent readers can start at the same range without moving the card's reading window. */
  fork(): ConversationHistoryWindow {
    const window = new ConversationHistoryWindow(this.agentId);
    window.initialized = this.initialized;
    window.tip = this.tip;
    window.boundary = this.boundary;
    window.from = this.from;
    return window;
  }

  expand(path: readonly RecordInfo[]): void {
    const boundary = this.lowerBound(path);
    const start = this.from ? path.findIndex(record => record.id === this.from) : path.length;
    this.from = path[this.pageStart(path, boundary, start)]?.id;
  }
  private pageStart(path: readonly RecordInfo[], boundary: number, before: number): number {
    let remaining = historyPageSize;
    for (let i = before - 1; i >= boundary; i--) {
      const record = path[i]!;
      if (record.source?.resource?.id !== this.agentId || !conversationRecordIds.includes(record.contract.id)) continue;
      // Cut after the first omitted conversation record, keeping intervening positional anchors.
      if (remaining === 0) return i + 1;
      remaining--;
    }
    return boundary;
  }
  private lowerBound(path: readonly RecordInfo[]): number {
    const boundary = this.boundary ? path.findIndex(record => record.id === this.boundary!.keptFrom) : 0;
    if (boundary < 0) throw new Error("The conversation reading boundary is outside the current path.");
    return boundary;
  }
}
