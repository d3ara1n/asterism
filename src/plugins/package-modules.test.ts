import { describe, expect, it } from "vitest";
import { unpackedArchivePath } from "./package-modules.ts";

// In packaged builds this is the sole path conversion for esbuild loading; incorrect archive rewrites reproduce spawn ENOTDIR
// or incorrectly rewrite ordinary development paths.
describe("asar unpacked path rewriting", () => {
  it("rewrites archive segments to .asar.unpacked and leaves other paths unchanged", () => {
    expect(unpackedArchivePath("/Applications/A.app/Contents/Resources/app.asar/node_modules/esbuild/lib/main.js"))
      .toBe("/Applications/A.app/Contents/Resources/app.asar.unpacked/node_modules/esbuild/lib/main.js");
  });
  it("rewrites Windows backslash paths with their original separators", () => {
    expect(unpackedArchivePath("C:\\Apps\\Asterism\\resources\\app.asar\\node_modules\\esbuild\\lib\\main.js"))
      .toBe("C:\\Apps\\Asterism\\resources\\app.asar.unpacked\\node_modules\\esbuild\\lib\\main.js");
  });
  it("leaves paths without archive segments and directories with .asar suffixes unchanged", () => {
    expect(unpackedArchivePath("/repo/node_modules/esbuild/lib/main.js")).toBeNull();
    expect(unpackedArchivePath("/data/backups.asar.d/note.txt")).toBeNull();
  });
});
