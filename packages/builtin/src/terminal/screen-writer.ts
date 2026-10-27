import type { Terminal } from "@xterm/xterm";
import type { TerminalDown } from "./contract.ts";

type ScreenFrame = Exclude<TerminalDown, { type: "status" }>;
interface PendingFrame { frame: ScreenFrame; done(): void }

/** Consumes each next frame only after the previous one completes; snapshots and deltas share the same xterm write queue. */
export class ScreenWriter {
  private readonly pending: PendingFrame[] = [];
  private active: PendingFrame | null = null;
  private disposed = false;

  constructor(private readonly terminal: Pick<Terminal, "write" | "reset" | "resize">) {}

  receive(frame: ScreenFrame, done: () => void) {
    if (this.disposed) { done(); return; }
    this.pending.push({ frame, done });
    this.drain();
  }

  private drain() {
    if (this.disposed || this.active) return;
    while (this.pending.length) {
      const next = this.pending.shift()!;
      const { frame } = next;
      if (frame.type === "reset") this.terminal.reset();
      if (frame.type !== "output") this.terminal.resize(frame.cols, frame.rows);
      if (frame.type === "resize") { next.done(); continue; }
      this.active = next;
      this.terminal.write(frame.data, () => {
        if (this.disposed) return;
        this.active = null;
        next.done();
        this.drain();
      });
      return;
    }
  }

  /** Releases unconsumed frames and acknowledges output after screen unmount, keeping the still-mounted header's channel flowing. */
  dispose() {
    this.disposed = true;
    this.active?.done();
    this.active = null;
    for (const pending of this.pending.splice(0)) pending.done();
  }
}
