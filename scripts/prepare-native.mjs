import { chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// node-pty 1.1.0 的 macOS 预编译包未保留 spawn-helper 执行位；打包前在依赖目录修正。
if (process.platform === "darwin") {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("node-pty/package.json"));
  for (const arch of ["arm64", "x64"]) {
    const helper = join(root, "prebuilds", `darwin-${arch}`, "spawn-helper");
    if (existsSync(helper)) chmodSync(helper, 0o755);
  }
}
