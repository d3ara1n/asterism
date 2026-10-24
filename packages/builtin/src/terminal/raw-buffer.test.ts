import { describe, expect, it } from "vitest";
import { RawBuffer } from "./raw-buffer.ts";

describe("终端原始输出范围", () => {
  // read 的 nextOffset 必须接续实际返回的文本，分页边界不能吞掉代理对。
  it("跨块的 emoji 在分页边界完整返回，下一页接续剩余内容", () => {
    const buffer = new RawBuffer();
    buffer.push("A\ud83d");
    buffer.push("\ude00B");
    const first = buffer.read(0, 2);
    expect(first).toEqual({ text: "A😀", offset: 0, nextOffset: 3, truncated: true });
    expect(buffer.read(first.nextOffset, 2)).toEqual({ text: "B", offset: 3, nextOffset: 4, truncated: false });
  });

  // 单位为 UTF-16 的 limit=1 也必须能读完一个非 BMP 字符，避免分页停滞。
  it("单单元预算仍能完整读取一个 emoji 并推进偏移", () => {
    const buffer = new RawBuffer();
    buffer.push("😀B");
    const first = buffer.read(0, 1);
    expect(first).toEqual({ text: "😀", offset: 0, nextOffset: 2, truncated: true });
    expect(buffer.read(first.nextOffset, 1).text).toBe("B");
  });

  // 显式偏移与默认尾读都可能从低代理项开始，返回偏移需反映向前对齐。
  it("从字符中间开始时返回完整字符及其实际起点", () => {
    const buffer = new RawBuffer();
    buffer.push("A😀");
    expect(buffer.read(2, 1)).toEqual({ text: "😀", offset: 1, nextOffset: 3, truncated: false });
    expect(buffer.read(undefined, 1)).toEqual({ text: "😀", offset: 1, nextOffset: 3, truncated: false });
  });

  // 预算是字符数而非整块数；只淘汰整块会多保留一个块。
  it("跨块超限裁掉最旧块的前缀，偏移仍按累计输入计算", () => {
    const buffer = new RawBuffer(8);
    buffer.push("abcdef");
    buffer.push("ghijkl");
    expect(buffer.read(0)).toEqual({ text: "efghijkl", offset: 4, nextOffset: 12, truncated: true });
    expect(buffer.read()).toEqual({ text: "efghijkl", offset: 4, nextOffset: 12, truncated: false });
  });

  // 单块超过整个预算时，也只保留该块尾部，并释放先前缓冲。
  it("单个大块也遵守保留上限", () => {
    const buffer = new RawBuffer(4);
    buffer.push("old");
    buffer.push("123456");
    expect(buffer.read(0)).toEqual({ text: "3456", offset: 5, nextOffset: 9, truncated: true });
  });

  // 淘汰后孤立的低代理项属于已丢弃字符，不能以半个 emoji 开始返回。
  it("淘汰边界切开 emoji 时丢弃其剩余半个字符并保持累计位置", () => {
    const buffer = new RawBuffer(3);
    buffer.push("😀");
    buffer.push("AB");
    expect(buffer.read(0)).toEqual({ text: "AB", offset: 2, nextOffset: 4, truncated: true });
    buffer.push("C");
    expect(buffer.read()).toEqual({ text: "ABC", offset: 2, nextOffset: 5, truncated: false });
  });
});
