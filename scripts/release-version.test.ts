import { describe, expect, it } from "vitest";
import { nextReleaseVersion } from "./release-version.ts";

describe("发布版本序列", () => {
  it("首次预发布采用约定基线，避免历史功能提交把首版重复抬升", () => {
    expect(nextReleaseVersion(null, ["feat: 工作台", "feat: 更新"], "prerelease")).toBe("0.1.0-beta.1");
  });
  it("beta 内新增功能继续当前目标，正式发布后才计算下一目标", () => {
    expect(nextReleaseVersion("0.1.0-beta.8", ["feat: 搜索"], "prerelease")).toBe("0.1.0-beta.9");
    expect(nextReleaseVersion("0.1.0", ["feat: 搜索", "fix: 修复"], "prerelease")).toBe("0.2.0-beta.1");
  });
  it("允许将已验证的 beta 发布为更高的正式版，不要求额外修改", () => {
    expect(nextReleaseVersion("1.1.0-beta.8", [], "release")).toBe("1.1.0");
  });
  it("破坏性正文优先于功能和修复，scoped 提交也参与计算", () => {
    expect(nextReleaseVersion("1.2.3", ["feat(ui): 新界面", "fix: 修复", "refactor: 存储\n\nBREAKING CHANGE: 格式改变"], "prerelease"))
      .toBe("2.0.0-beta.1");
    expect(nextReleaseVersion("1.2.3", ["fix(runtime): 修复"], "release")).toBe("1.2.4");
  });
  it("无功能变更时跳过发包，避免定时重复发布相同程序", () => {
    expect(nextReleaseVersion("0.1.0-beta.1", ["docs: 说明"], "prerelease")).toBeNull();
    expect(nextReleaseVersion("0.1.0", [], "release")).toBeNull();
  });
});
