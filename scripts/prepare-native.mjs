import { chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// The node-pty 1.1.0 macOS prebuild loses the spawn-helper executable bit; fix it in the dependency directory before packaging.
if (process.platform === "darwin") {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("node-pty/package.json"));
  for (const arch of ["arm64", "x64"]) {
    const helper = join(root, "prebuilds", `darwin-${arch}`, "spawn-helper");
    if (existsSync(helper)) chmodSync(helper, 0o755);
  }
}
