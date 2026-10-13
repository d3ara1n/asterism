import { describe, expect, it } from "vitest";
import { SubmissionIdentity } from "./submission";

// 预期来自提交身份契约：同输入重试保留身份，受理后同文本属于新的提交。
describe("提交身份", () => {
  it("丢失响应后保留提交身份，受理后相同文本取得新身份", () => {
    const identity = new SubmissionIdentity(), input = { text: "Hello" };
    const first = identity.forInput(input);
    expect(identity.forInput(input)).toBe(first);
    identity.accepted();
    expect(identity.forInput(input)).not.toBe(first);
  });
});
