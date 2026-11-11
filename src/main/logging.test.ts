import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UtilityProcess } from "electron";
import { expect, it, vi } from "vitest";
import { applicationStorage } from "../shared/application.ts";
import { observeProcess } from "./logging.ts";

function fakeChild() {
  return Object.assign(new EventEmitter(), { pid: 123, stdout: null, stderr: null });
}

it("preserves separate original fatal reports before subsequent process-error handling", () => {
  const root = mkdtempSync(join(tmpdir(), "asterism-diagnostics-"));
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const child = fakeChild();
  const reports = ['{ "message": "first failure", "stack": "line 1\\nline 2" }\n', '{"message":"second failure: 中文"}'];
  const directory = join(root, applicationStorage.diagnosticsDirectory);
  const captured: string[][] = [];
  try {
    observeProcess(child as unknown as UtilityProcess, "runtime", root);
    child.emit("spawn");
    // The supervisor can terminate immediately: capture must already have completed at this boundary.
    child.on("error", () => captured.push(readdirSync(directory).map(name => readFileSync(join(directory, name), "utf8"))));
    for (const report of reports) child.emit("error", "FatalError", "v8::FatalProcessOutOfMemory", report);
    expect(captured[0]).toEqual([reports[0]]);
    expect(captured[1]?.sort()).toEqual([...reports].sort());
    if (process.platform !== "win32") {
      for (const name of readdirSync(directory)) expect(statSync(join(directory, name)).mode & 0o777).toBe(0o600);
    }
  } finally {
    output.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
});

it("exposes a report-write failure without preventing the supervisor from handling the fatal error", () => {
  const root = mkdtempSync(join(tmpdir(), "asterism-diagnostics-"));
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const child = fakeChild();
  const supervise = vi.fn();
  try {
    writeFileSync(join(root, applicationStorage.diagnosticsDirectory), "blocked");
    observeProcess(child as unknown as UtilityProcess, "runtime", root);
    child.on("error", supervise);
    child.emit("error", "FatalError", "v8::FatalProcessOutOfMemory", "private report body");
    expect(supervise).toHaveBeenCalledOnce();
    expect(output).toHaveBeenCalledWith(expect.stringContaining("write failed"), expect.objectContaining({
      source: "runtime", type: "FatalError", error: expect.any(Error),
    }));
    expect(JSON.stringify(output.mock.calls)).not.toContain("private report body");
  } finally {
    output.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
});
