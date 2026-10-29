import type { TerminalConfig, TerminalDown, TerminalUp, TerminalStatus, TerminalImage } from "./terminal.ts";

export interface TerminalViewer { send(frame: TerminalDown): void }
export class TerminalError extends Error { constructor(readonly code: string, message: string) { super(message); } }
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
  read(source: "screen" | "history" | "raw", offset?: number, limit?: number): Promise<TerminalStatus & {
    source: "screen" | "history" | "raw"; text: string; cols: number; rows: number;
    cursor: { x: number; y: number }; offset: number; nextOffset: number; truncated: boolean;
  }>;
  image(): Promise<TerminalImage>;
  waitIdle(timeout: number, signal: AbortSignal): Promise<TerminalStatus & { reason: string; elapsedMs: number }>;
}
export interface TerminalSessions {
  create(config: TerminalConfig, events: { failed(error: unknown): void; log(message: string, error: unknown): void }): InteractiveTerminal;
}
