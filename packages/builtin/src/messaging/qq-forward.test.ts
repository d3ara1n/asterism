import { describe, expect, it } from "vitest";
import { qqForwardMarkdown } from "./qq-forward.ts";

describe("QQ merged-forward text", () => {
  const transcript = [
    "[群聊的聊天记录]",
    "=== 消息 1 ===",
    "[发送者] 🤔",
    "",
    "=== 消息 2 ===",
    "[消息内容] 九点开。",
    "",
    "记得更新。",
    "[发送者] 阿周*",
    "[关联消息]",
    "--- 第1条 ---",
    "    [消息内容] 今晚还开服吗？",
    "    [消息类型] 引用消息",
    "",
    "=== 消息 3 ===",
    "[消息内容] 收到。",
    "[发送者] 小林",
  ].join("\n");

  it("renders the transcript in order without inventing bodies for sender-only entries", () => {
    expect(qqForwardMarkdown(transcript)).toBe([
      "**群聊的聊天记录**",
      "",
      "1. **🤔**",
      "2. **阿周\\***：九点开。",
      "   ",
      "   记得更新。",
      "",
      "   > 今晚还开服吗？",
      "3. **小林**：收到。",
    ].join("\n"));
  });

  it("retains the complete source when an entry is malformed or the relation type is not recognized", () => {
    const missingSender = transcript.replace("[发送者] 阿周*", "");
    const unknownRelation = transcript.replace("引用消息", "其他消息");
    expect(qqForwardMarkdown(missingSender)).toBe(missingSender);
    expect(qqForwardMarkdown(unknownRelation)).toBe(unknownRelation);
  });
});
