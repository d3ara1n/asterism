import { describe, expect, it } from "vitest";
import { ScreenWriter } from "./screen-writer.ts";

describe("terminal frame consumption order", () => {
  // Verify the queue by explicitly triggering write-completion callbacks, without relying on xterm rendering or timers.
  it("consumes old output, snapshots, dimensions, and deltas strictly in frame order, acknowledging only after writing completes", () => {
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

  // The header still holds the channel when the card is collapsed; discarded frames must also be acknowledged so the backend backlog can drain.
  it("unmounting releases current and queued frames, and late write callbacks neither acknowledge twice nor continue writing to the screen", () => {
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
