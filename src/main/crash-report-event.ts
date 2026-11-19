import type { ErrorEvent } from "@sentry/electron/main";

const applicationFile = /^(?:app:\/\/\/dist\/(?:main|preload)\/|asterism-plugin:\/\/app\/assets\/)[a-zA-Z0-9_.-]+\.(?:js|cjs)$/u;
const errorTypes = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "URIError", "EvalError", "AggregateError", "OutOfMemoryError"]);
const processes = new Set(["browser", "main", "renderer", "utility", "gpu", "GPU", "node", "zygote"]);
const exitReasons = new Set(["crashed", "abnormal-exit", "oom", "launch-failed", "integrity-failure", "memory-eviction"]);
const stages = new Set(["startup", "preload", "render", "runtime", "preparation"]);

/** Rebuild the event from known-safe fields; messages and stack locals can contain workspace data. */
export function crashReportEvent(event: ErrorEvent): ErrorEvent {
  const values = event.exception?.values?.slice(-5).map(exception => {
    const frames = exception.stacktrace?.frames?.flatMap(frame => frame.filename && applicationFile.test(frame.filename) ? [{
      filename: frame.filename, lineno: frame.lineno, colno: frame.colno, in_app: true,
    }] : []).slice(-50);
    return {
      type: errorTypes.has(exception.type ?? "") ? exception.type : "Error",
      value: "Application exception",
      ...(frames?.length ? { stacktrace: { frames } } : {}),
    };
  });
  const images = event.debug_meta?.images?.filter(image => image.type === "sourcemap" && applicationFile.test(image.code_file) &&
    /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(image.debug_id));
  const tags: NonNullable<ErrorEvent["tags"]> = {};
  for (const [key, allowed] of [["event.process", processes], ["exit.reason", exitReasons], ["stage", stages]] as const) {
    const value = event.tags?.[key];
    if (typeof value === "string" && allowed.has(value)) tags[key] = value;
  }
  const native = event.platform === "native";
  return {
    type: undefined, event_id: event.event_id, timestamp: event.timestamp, release: event.release, environment: event.environment,
    platform: native ? "native" : "javascript", level: native || event.level === "fatal" ? "fatal" : "error", tags,
    ...(values?.length ? { exception: { values } } : { message: native ? "Native crash" : "Application exception" }),
    ...(images?.length ? { debug_meta: { images } } : {}),
  };
}
