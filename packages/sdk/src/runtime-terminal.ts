import type { TerminalConfig, TerminalDown, TerminalUp, TerminalStatus, TerminalImage } from "./terminal.ts";

export interface TerminalViewer { send(frame: TerminalDown): void }
export class TerminalError extends Error { constructor(readonly code: string, message: string) { super(message); } }
/** `history` is a compatibility alias for `buffer`. */
export type TerminalReadSource = "screen" | "buffer" | "raw" | "history";
export interface InteractiveTerminal {
  readonly status: TerminalStatus;
  readonly started: boolean;
  readonly applicationCursor: boolean;
  start(): Promise<void>;
  close(): Promise<void>;
  dispose(): Promise<void>;
  attach(viewer: TerminalViewer): (message: TerminalUp) => void;
  detach(viewer: TerminalViewer): void;
  input(data: string, signal: AbortSignal): Promise<TerminalStatus>;
  read(source: TerminalReadSource, offset?: number, limit?: number): Promise<TerminalStatus & {
    source: TerminalReadSource; text: string; cols: number; rows: number;
    cursor: { x: number; y: number }; offset: number; nextOffset: number; truncated: boolean;
    /** Buffer reads include its active type, retained row count, and the screen's first row at read time. */
    buffer?: "normal" | "alternate"; totalRows?: number; screenOffset?: number;
  }>;
  image(): Promise<TerminalImage>;
  waitIdle(timeout: number | undefined, signal: AbortSignal): Promise<TerminalStatus & { reason: string; elapsedMs: number }>;
}
export interface TerminalSessions {
  create(config: TerminalConfig, events: {
    /** Whether this terminal owns a live shell process, independent of viewers or foreground command state. */
    aliveChanged?(alive: boolean): void;
    failed(error: unknown): void;
    log(message: string, error: unknown): void;
  }): InteractiveTerminal;
}
