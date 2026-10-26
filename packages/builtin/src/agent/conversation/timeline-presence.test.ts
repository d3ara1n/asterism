import { describe, expect, it } from "vitest";
import { retainExitingItems } from "./timeline-presence";
import { timelineKey, type TimelineItem } from "./timeline";

const text = (id: string): TimelineItem => ({ kind: "text", id, responseId: id, ordinal: 0, text: id, endedAt: 1 });
const process: TimelineItem = { kind: "turn-process", id: "process", open: false, incomplete: false, toolCount: 2 };

describe("虚拟列表的退场条目排列", () => {
  // 自动收纳时概要行是新条目；保留的可见过程应仍在概要上方，离屏内容不占退场位置。
  it("可见过程保留在新概要上方，离屏过程立即移出", () => {
    const hidden = text("offscreen"), visible = text("visible"), answer = text("answer");
    const result = retainExitingItems([hidden, visible, answer], [process, answer],
      new Set([timelineKey(visible), timelineKey(answer)]),
      new Map([[timelineKey(hidden), process.id], [timelineKey(visible), process.id]]));
    expect(result.map(item => item.id)).toEqual(["visible", "process", "answer"]);
  });

  // 同轮 steer 保持可见；不能为了把过程归到概要上方，先将较早的过程搬到补充消息之后。
  it("退场过程不越过中途补充消息", () => {
    const before = text("before"), after = text("after"), answer = text("answer");
    const steer: TimelineItem = { kind: "message", id: "steer", parts: [], sender: { kind: "user" }, startsTurn: false };
    const result = retainExitingItems([before, steer, after, answer], [steer, process, answer],
      new Set([timelineKey(before), timelineKey(after)]),
      new Map([[timelineKey(before), process.id], [timelineKey(after), process.id]]));
    expect(result.map(item => item.id)).toEqual(["before", "steer", "after", "process", "answer"]);
  });

  // 连续点击可在退场完成前恢复同一条目；应复用目标版本，不重复旧条目或吞掉最新内容。
  it("退场期间恢复条目时使用目标内容且只出现一次", () => {
    const old = text("visible"), updated = { ...text("visible"), text: "Updated" };
    const target = [updated, { ...process, open: true }];
    const result = retainExitingItems([old, process], target, new Set([timelineKey(old), process.id]), new Map());
    expect(result).toEqual(target);
    expect(result[0]).toBe(updated);
  });

  // 压缩活动与成功记录身份不同；退出的运行行须在新完成行前，局部叠放才能原位交替。
  it("压缩成功接替运行提示时，退场活动紧邻成功记录之前", () => {
    const running: TimelineItem = { kind: "compression", id: "activity", status: "running" };
    const completed: TimelineItem = { kind: "compression", id: "saved", status: "completed" };
    expect(retainExitingItems([running], [completed], new Set(["activity"]), new Map()).map(item => item.id))
      .toEqual(["activity", "saved"]);
  });

  // 路径切换也会移除可见条目；没有收纳概要时按原来的后继定位，尾部退出项保持在末尾。
  it("普通移除保留原先后关系和目标中的新增条目", () => {
    const a = text("a"), b = text("b"), c = text("c"), d = text("d"), added = text("new");
    expect(retainExitingItems([a, b, c, d], [a, added, c], new Set([timelineKey(b), timelineKey(d)]), new Map()).map(item => item.id))
      .toEqual(["a", "new", "b", "c", "d"]);
  });
});
