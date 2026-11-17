#!/usr/bin/env node
import { watch } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildPlugin } from "./index.js";

const { values } = parseArgs({ options: { root: { type: "string", default: "." }, watch: { type: "boolean", default: false }, help: { type: "boolean", short: "h" } } });
if (values.help) {
  console.log("Usage: asterism-plugin-build [--root <package-directory>] [--watch]");
} else {
  const root = resolve(values.root!);
  const run = async () => {
    const result = await buildPlugin({ root });
    console.log(`Built ${result.artifact.id}: ${result.pointerPath} (${result.artifact.buildId})`);
  };
  if (!values.watch) {
    await run();
  } else {
    // Writes produced by this builder are excluded; source changes during a build queue one later build.
    let running = false, pending = false;
    const rebuild = async () => {
      if (running) { pending = true; return; }
      running = true;
      do {
        pending = false;
        try { await run(); } catch (error) { console.error(error); }
      } while (pending);
      running = false;
    };
    const watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename || /^(?:dist|node_modules|\.git)(?:[\\/]|$)/u.test(filename)) return;
      void rebuild();
    });
    await rebuild();
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { watcher.close(); });
  }
}
