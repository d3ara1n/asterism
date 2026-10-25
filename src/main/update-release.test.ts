import { describe, expect, it } from "vitest";
import { selectUpdateRelease } from "./update-release.ts";

const release = (tag_name: string, prerelease = false, draft = false) => ({ tag_name, prerelease, draft });

describe("更新候选选择", () => {
  it("预发布开关控制 GitHub 标记，开启后能从正式版进入预发布并接续正式版", () => {
    const preview = release("v1.1.0-prerelease.8", true);
    expect(selectUpdateRelease([preview, release("v1.0.0")], "1.0.0", false)).toBeNull();
    expect(selectUpdateRelease([preview, release("v1.0.0")], "1.0.0", true)).toEqual(preview);
    expect(selectUpdateRelease([preview, release("v1.1.0")], "1.1.0-prerelease.8", true)?.tag_name).toBe("v1.1.0");
  });
  it("关闭预发布不降级，尚无正式版也只返回没有更新", () => {
    expect(selectUpdateRelease([release("v1.0.0"), release("v1.1.0-prerelease.8", true)], "1.1.0-prerelease.8", false)).toBeNull();
    expect(selectUpdateRelease([release("v0.1.0-prerelease.1", true)], "0.1.0-prerelease.1", false)).toBeNull();
  });
  it("按版本大小选择，避免较晚发布的旧候选晋级遮住更高的预发布", () => {
    expect(selectUpdateRelease([release("v1.1.0"), release("v1.2.0-prerelease.2", true)], "1.1.0-prerelease.3", true)?.tag_name)
      .toBe("v1.2.0-prerelease.2");
  });
  it("未公开的草稿和非软件版本标签不进入更新候选", () => {
    expect(selectUpdateRelease([release("v9.0.0", false, true), release("docs"), release("v1.0.1")], "1.0.0", true)?.tag_name).toBe("v1.0.1");
  });
});
