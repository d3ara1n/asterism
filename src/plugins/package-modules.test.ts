import { describe, expect, it } from "vitest";
import { unpackedArchivePath } from "./package-modules.ts";

// 打包版里这是 esbuild 可加载性的唯一路径转换：归档段改写错了会重现 spawn ENOTDIR
// 或在开发环境错误改写正常路径。
describe("asar 解包路径改写", () => {
  it("归档段改写为 .asar.unpacked，其余路径不变", () => {
    expect(unpackedArchivePath("/Applications/A.app/Contents/Resources/app.asar/node_modules/esbuild/lib/main.js"))
      .toBe("/Applications/A.app/Contents/Resources/app.asar.unpacked/node_modules/esbuild/lib/main.js");
  });
  it("Windows 反斜杠路径按原分隔符改写", () => {
    expect(unpackedArchivePath("C:\\Apps\\Asterism\\resources\\app.asar\\node_modules\\esbuild\\lib\\main.js"))
      .toBe("C:\\Apps\\Asterism\\resources\\app.asar.unpacked\\node_modules\\esbuild\\lib\\main.js");
  });
  it("无归档段与 .asar 后缀目录不改动", () => {
    expect(unpackedArchivePath("/repo/node_modules/esbuild/lib/main.js")).toBeNull();
    expect(unpackedArchivePath("/data/backups.asar.d/note.txt")).toBeNull();
  });
});
