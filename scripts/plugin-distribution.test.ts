import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pluginDistributionFiles } from "./plugin-distribution.ts";

it("selects the published build while leaving retained builds out of the distribution", () => {
  const root = mkdtempSync(join(tmpdir(), "asterism-distribution-"));
  try {
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ asterism: { artifact: "dist/plugin.json" } }));
    const publish = (build: string) => writeFileSync(join(root, "dist/plugin.json"), JSON.stringify({ format: 1, build }));
    publish("builds/old");
    expect(pluginDistributionFiles(root)).toContain("dist/builds/old/**");
    publish("builds/current");
    const files = pluginDistributionFiles(root);
    expect(files).toContain("dist/builds/current/**");
    expect(files).not.toContain("dist/builds/old/**");
    expect(files).not.toContain("dist/**");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
