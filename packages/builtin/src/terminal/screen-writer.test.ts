import { describe, expect, it } from "vitest";
import { ScreenWriter } from "./screen-writer.ts";

describe("终端帧消费顺序", () => {
  // 显式触发写入完成回调验证队列，不依赖 xterm 渲染或计时器。
  it("旧输出、快照、尺寸和增量严格按帧顺序消费，确认发生在写完之后", () => {
    const events: string[] = [];
    const writes: (() => void)[] = [];
    const writer = new ScreenWriter({
      reset: () => { events.push("reset"); },
      resize: (cols, rows) => { events.push(`resize:${cols}x${rows}`); },
      write: (data, done) => { events.push(`write:${data}`); writes.push(done!); },
    });
    writer.receive({ type: "output", data: "old" }, () => events.push("ack:old"));
    writer.receive({ type: "reset", cols: 100, rows: 28, data: "snapshot" }, () => events.push("ack:snapshot"));
    writer.receive({ type: "resize", cols: 80, rows: 24 }, () => events.push("ack:resize"));
    writer.receive({ type: "output", data: "+live" }, () => events.push("ack:live"));
    expect(events).toEqual(["write:old"]);
    writes.shift()!();
    expect(events).toEqual(["write:old", "ack:old", "reset", "resize:100x28", "write:snapshot"]);
    writes.shift()!();
    expect(events.slice(5)).toEqual(["ack:snapshot", "resize:80x24", "ack:resize", "write:+live"]);
    writes.shift()!();
    expect(events.at(-1)).toBe("ack:live");
    writer.dispose();
  });

  // 卡片折叠时头部仍持有通道；丢弃的帧也须确认，避免后台积压无法清空。
  it("卸载释放当前及排队帧，迟到的写入回调不重复确认或继续写屏幕", () => {
    const events: string[] = [];
    let complete!: () => void;
    const writer = new ScreenWriter({
      reset: () => { events.push("reset"); },
      resize: () => { events.push("resize"); },
      write: (data, done) => { events.push(`write:${data}`); complete = done!; },
    });
    writer.receive({ type: "output", data: "first" }, () => events.push("ack:first"));
    writer.receive({ type: "output", data: "second" }, () => events.push("ack:second"));
    writer.dispose();
    complete();
    writer.dispose();
    expect(events).toEqual(["write:first", "ack:first", "ack:second"]);
  });
});
