import { describe, expect, it } from "vitest";
import { advanceThinkingDisclosure, initialThinkingDisclosure, thinkingDuration } from "./thinking-state";

const defaults = { thinkingAutoExpand: true, thinkingAutoCollapse: true };

describe("思考开合与计时", () => {
  it("默认实时展开、结束收起；历史初次打开始终收起", () => {
    const live = initialThinkingDisclosure(true, defaults);
    expect(live.open).toBe(true);
    expect(advanceThinkingDisclosure(live, false, defaults)).toEqual({ streaming: false, open: false });
    expect(initialThinkingDisclosure(false, { thinkingAutoExpand: true, thinkingAutoCollapse: false }).open).toBe(false);
  });
  it("自动展开与结束折叠独立关闭，关闭折叠保留当前开合状态", () => {
    expect(initialThinkingDisclosure(true, { ...defaults, thinkingAutoExpand: false }).open).toBe(false);
    const expanded = initialThinkingDisclosure(true, defaults);
    expect(advanceThinkingDisclosure(expanded, false, { ...defaults, thinkingAutoCollapse: false }).open).toBe(true);
    expect(advanceThinkingDisclosure({ ...expanded, open: false }, false, { ...defaults, thinkingAutoCollapse: false }).open).toBe(false);
  });
  it("增量与设置变化不覆盖手动选择，结束后手动展开也不会再次自动收起", () => {
    const closed = { streaming: true, open: false };
    expect(advanceThinkingDisclosure(closed, true, defaults)).toBe(closed);
    const opened = { streaming: false, open: true };
    expect(advanceThinkingDisclosure(opened, false, defaults)).toBe(opened);
  });
  it("计时取真实起止时间，历史没有起点时不虚构耗时", () => {
    expect(thinkingDuration(1000, 66000)).toBe("1:05");
    expect(thinkingDuration(1000, 1999)).toBe("0:00");
    expect(thinkingDuration(1000, 500)).toBe("0:00");
    expect(thinkingDuration(null, 66000)).toBeNull();
    expect(thinkingDuration(1000, NaN)).toBeNull();
  });
});
