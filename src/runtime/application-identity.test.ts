import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applicationDataDirectory, applicationSlug } from "../shared/application.ts";

describe("应用身份与工程清单", () => {
  it("开发与发布使用固定身份目录，不依赖品牌显示名或仓库目录", () => {
    expect(applicationDataDirectory(false)).toBe("dev.dearain.atelier-development");
    expect(applicationDataDirectory(true)).toBe("dev.dearain.atelier");
  });
  it("npm 与 lockfile 的根包名称同步共享定义", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const lockfile = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
    expect(manifest.name).toBe(applicationSlug);
    expect(lockfile.name).toBe(applicationSlug);
    expect(lockfile.packages[""].name).toBe(applicationSlug);
  });
});
