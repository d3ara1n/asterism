import type { RecordInfo } from "@asterism-app/sdk/contracts";

export interface HistoryBoundary { summaryId: string; keptFrom: string }
export interface HistoryRange { boundary: HistoryBoundary | null; from?: string; earlier: boolean }
const historyPageSize = 100;

/** The reading boundary is retained with the Agent in frontend memory; appended summaries add markers only, and the boundary is reevaluated on reload or an explicit path switch. */
export class ConversationHistoryWindow {
  private initialized = false;
  private tip: string | null = null;
  private boundary: HistoryBoundary | null = null;
  private from: string | undefined;

  observe(path: readonly RecordInfo[], summary: HistoryBoundary | null): HistoryRange {
    if (!this.initialized || (this.tip !== null && !path.some(record => record.id === this.tip))) {
      this.boundary = summary;
      this.from = undefined;
      this.initialized = true;
    }
    this.tip = path.at(-1)?.id ?? null;
    const boundary = this.lowerBound(path);
    this.from ??= path[Math.max(boundary, path.length - historyPageSize)]?.id;
    const start = this.from ? path.findIndex(record => record.id === this.from) : boundary;
    return { boundary: this.boundary, from: this.from, earlier: start > boundary };
  }

  expand(path: readonly RecordInfo[]): void {
    const boundary = this.lowerBound(path);
    const start = this.from ? path.findIndex(record => record.id === this.from) : path.length;
    this.from = path[Math.max(boundary, start - historyPageSize)]?.id;
  }
  private lowerBound(path: readonly RecordInfo[]): number {
    const boundary = this.boundary ? path.findIndex(record => record.id === this.boundary!.keptFrom) : 0;
    if (boundary < 0) throw new Error("The conversation reading boundary is outside the current path.");
    return boundary;
  }
}
