import { describe, expect, it } from "vitest";
import { advanceStreamingDisclosure as advance, changeStreamingDisclosure as change, initialStreamingDisclosure as initial } from "./streaming-disclosure.ts";

const preferences = { autoExpand: true, autoCollapse: true };

// 工作台契约：首段正文等待一秒，阶段结束取消等待，手动选择优先；以显式数值验证状态转换。
describe("公共流式预览开合", () => {
  it("空阶段不提前计时，正文增量沿用首段起点，到一秒才展开", () => {
    const empty = advance(initial(), "input", false, preferences, 0);
    expect(advance(empty, "input", false, preferences, 3000).open).toBe(false);
    const content = advance(empty, "input", true, preferences, 3000);
    const increment = advance(content, "input", true, preferences, 3999);
    expect(increment.open).toBe(false);
    expect(advance(increment, "input", true, preferences, 4000).open).toBe(true);
  });

  it("短流结束取消等待，历史与迟到的刷新保持折叠", () => {
    const pending = advance(initial(), "thinking", true, preferences, 0);
    const ended = advance(pending, null, false, preferences, 999);
    expect(ended).toMatchObject({ open: false, expandAt: null });
    expect(advance(ended, null, false, preferences, 1000).open).toBe(false);
    expect(advance(initial(), null, true, preferences, 5000).open).toBe(false);
  });

  it("输入与执行产出各自等待，执行中的后续活动保留同一阶段", () => {
    const input = advance(initial(), "input", true, preferences, 0);
    const output = advance(input, "output", false, preferences, 500);
    const writing = advance(output, "output", true, preferences, 2000);
    expect(advance(writing, "output", true, preferences, 2500).open).toBe(false);
    const activity = advance(writing, "output", false, preferences, 2800);
    expect(advance(activity, "output", true, preferences, 3000).open).toBe(true);
  });

  it("等待期间手动打开再关闭，后续增量与到期刷新均不重开", () => {
    const pending = advance(initial(), "thinking", true, preferences, 0);
    const opened = change(pending, true);
    expect(opened).toMatchObject({ open: true, expandAt: null });
    const closed = change(opened, false);
    expect(advance(closed, "thinking", true, preferences, 2000).open).toBe(false);
    // 工具的正文组件可先于内容存在，此时的手动选择同样优先。
    const empty = advance(initial(), "input", false, preferences, 0);
    const manual = change(change(empty, true), false);
    const content = advance(manual, "input", true, preferences, 100);
    expect(advance(content, "input", true, preferences, 2000).open).toBe(false);
  });

  it("关闭自动展开取消等待，重新开启偏好不在同阶段重触发", () => {
    const disabled = { ...preferences, autoExpand: false };
    const pending = advance(initial(), "output", true, preferences, 0);
    const cancelled = advance(pending, "output", true, disabled, 500);
    expect(cancelled.expandAt).toBeNull();
    expect(advance(cancelled, "output", true, preferences, 2000).open).toBe(false);
    const initiallyDisabled = advance(initial(), "input", true, disabled, 0);
    expect(advance(initiallyDisabled, "input", true, preferences, 2000).open).toBe(false);
  });

  it("结束只折叠一次，关闭自动折叠保留当前状态", () => {
    const pending = advance(initial(), "output", true, preferences, 0);
    const open = advance(pending, "output", true, preferences, 1000);
    const ended = advance(open, null, false, preferences, 2000);
    expect(ended.open).toBe(false);
    const reopened = change(ended, true);
    expect(advance(reopened, null, false, preferences, 3000).open).toBe(true);
    expect(advance(open, null, false, { ...preferences, autoCollapse: false }, 2000).open).toBe(true);
    expect(advance(pending, null, false, { ...preferences, autoCollapse: false }, 500).open).toBe(false);
  });

  it("未参与流式预览的工具保留手动开合，阶段切换不触发自动折叠", () => {
    const input = advance(initial(), "input", false, preferences, 0);
    const opened = change(input, true);
    const executing = advance(opened, "output", false, preferences, 2000);
    expect(executing.open).toBe(true);
    expect(advance(executing, null, false, preferences, 3000).open).toBe(true);
  });

  it("需要处理的正文立即展开一次，不受偏好与此前手动折叠影响", () => {
    const off = { autoExpand: false, autoCollapse: true };
    const closed = change(advance(initial(), "output", false, off, 0), false);
    const attention = advance(closed, "output", false, off, 10, true);
    expect(attention).toMatchObject({ open: true, expandAt: null });
    // 用户随后折叠，同阶段持续的需要处理状态不再重开。
    expect(advance(change(attention, false), "output", false, off, 20, true).open).toBe(false);
  });

  it("需要处理的阶段结束保持开合，处理结果在原位呈现", () => {
    const attention = advance(initial(), "output", true, preferences, 0, true);
    expect(advance(attention, null, false, preferences, 5000).open).toBe(true);
    // 新阶段重新计算，旧阶段的标记不阻止下一次展开。
    const next = advance(change(advance(attention, null, false, preferences, 5000), false), "output", false, preferences, 6000, true);
    expect(next.open).toBe(true);
  });
});
