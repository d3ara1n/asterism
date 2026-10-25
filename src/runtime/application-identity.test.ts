import { describe, expect, it } from "vitest";
import { applicationDataDirectory } from "../shared/application.ts";

describe("应用身份与工程清单", () => {
  it("开发与发布使用固定身份目录，不依赖品牌显示名或仓库目录", () => {
    expect(applicationDataDirectory(false)).toBe("dev.dearain.atelier.dev");
    expect(applicationDataDirectory(true)).toBe("dev.dearain.atelier");
  });
});
