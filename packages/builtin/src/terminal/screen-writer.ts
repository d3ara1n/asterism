import type { Terminal } from "@xterm/xterm";
import type { TerminalDown } from "./contract.ts";

type ScreenFrame = Exclude<TerminalDown, { type: "status" }>;
interface PendingFrame { frame: ScreenFrame; done(): void }

/** 每帧完成后才消费下一帧，快照与增量共用同一条 xterm 写入队列。 */
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

  /** 屏幕卸载后释放未消费帧并确认输出，保持仍挂载的头部通道畅通。 */
  dispose() {
    this.disposed = true;
    this.active?.done();
    this.active = null;
    for (const pending of this.pending.splice(0)) pending.done();
  }
}
