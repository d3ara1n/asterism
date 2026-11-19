import { describe, expect, it } from "vitest";
import { crashReportEvent } from "./crash-report-event.ts";

const debugId = "10000000-1000-4000-8000-100000000000";

describe("crash report data boundary", () => {
  it("drops workspace data and keeps packaged application frames and their source maps", () => {
    const applicationFile = "app:///dist/main/runtime.js";
    const rendererFile = "asterism-plugin://app/assets/index-abc.js";
    const workspaceFile = "/Users/name/project/private.js";
    const result = crashReportEvent({
      type: undefined, user: { email: "private@example.com" }, request: { data: "credential" },
      extra: { prompt: "workspace content" }, breadcrumbs: [{ message: "tool result" }],
      tags: { stage: "runtime", "event.process": "utility", project: "workspace", "exit.reason": "bad token" },
      exception: { values: [{ type: "TypeError", value: "private exception message", stacktrace: { frames: [
        { filename: applicationFile, function: "sensitiveName", lineno: 50, colno: 2, vars: { token: "credential" } },
        { filename: workspaceFile, lineno: 2, colno: 4 },
        { filename: rendererFile, lineno: 12, colno: 6 },
      ] } }] },
      debug_meta: { images: [applicationFile, workspaceFile].map(code_file => ({ type: "sourcemap", debug_id: debugId, code_file })) },
    });
    expect(result.exception?.values?.[0]).toEqual({ type: "TypeError", value: "Application exception", stacktrace: { frames: [
      { filename: applicationFile, lineno: 50, colno: 2, in_app: true }, { filename: rendererFile, lineno: 12, colno: 6, in_app: true },
    ] } });
    expect(result.debug_meta?.images).toEqual([{ type: "sourcemap", code_file: applicationFile, debug_id: debugId }]);
    expect(result.tags).toEqual({ stage: "runtime", "event.process": "utility" });
    for (const field of ["user", "request", "extra", "breadcrumbs"]) expect(result).not.toHaveProperty(field);
  });

  it("retains native crash classification without annotations or custom messages", () => {
    const result = crashReportEvent({ type: undefined, platform: "native", message: "private message",
      contexts: { electron: { crashed_url: "file:///Users/name/private" } }, tags: { "exit.reason": "oom" } });
    expect(result).toMatchObject({ platform: "native", level: "fatal", message: "Native crash", tags: { "exit.reason": "oom" } });
    expect(result).not.toHaveProperty("contexts");
  });
});
