import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createNpmProcess } from "./npm-process.ts";

test("cancelling an owned installer settles its process before returning", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asterism-installer-process-"));
  const controller = new AbortController();
  let result: Promise<unknown> | undefined;
  try {
    const entry = join(directory, "installer.cjs");
    // An actual server keeps the child alive; readiness is an explicit pipe handshake, not elapsed time.
    writeFileSync(entry, "require('node:net').createServer().listen(0, '127.0.0.1', () => process.stdout.write('READY ' + process.pid + '\\n'));\n");
    let ready!: (pid: number) => void;
    const started = new Promise<number>(resolve => { ready = resolve; });
    result = createNpmProcess(() => entry).run([], directory, controller.signal, (_stream, output) => {
      const match = /READY (\d+)/u.exec(output); if (match) ready(Number(match[1]));
    });
    const pid = await Promise.race([started, result.then(() => { throw new Error("Installer exited before readiness."); })]);
    controller.abort();
    await expect(result).rejects.toBe(controller.signal.reason);
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    controller.abort(); await result?.catch(() => {});
    rmSync(directory, { recursive: true, force: true });
  }
}, 10_000);
