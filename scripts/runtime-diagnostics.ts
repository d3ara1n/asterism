import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import type { HeapProfiler, Runtime } from "node:inspector";
import { connectInspector, type InspectorConnection, type InspectorRequests } from "./runtime-diagnostics/inspector.ts";
import { captureOptions, cpuPercent, type CaptureOptions, type ProcessSample } from "./runtime-diagnostics/options.ts";
import { CaptureFiles, saveHeapSnapshot, saveProfile, type MemorySample } from "./runtime-diagnostics/artifacts.ts";

const help = `Usage: npm run diagnose:runtime -- [options]

Attach to an already-running task runtime. Start it with npm run dev:diagnostics.

  --port <port>                 Loopback inspector port (default: 9230)
  --interval <seconds>          Memory/process sampling interval (default: 5)
  --profile-interval <seconds>  Allocation-profile checkpoint interval (default: 120)
  --sampling-interval <bytes>   Average allocation sampling interval (default: 131072)
  --output <directory>         Parent of a new capture directory (default: .local/runtime-diagnostics)
  --help                       Show this help

While recording, enter snapshot for a full heap snapshot, profile for an allocation
checkpoint, or stop to disconnect. Ctrl+C also stops collection. Commands run after
the current operation; snapshots pause the target and require extra memory.

No automatic reconnect, forced GC, near-OOM snapshot, or remote upload is performed.
`;

async function evaluate<T>(requests: InspectorRequests, expression: string): Promise<T> {
  const reply = await requests.post<Runtime.EvaluateReturnType>("Runtime.evaluate", { expression, returnByValue: true });
  if (reply.exceptionDetails) throw new Error(`Target evaluation failed: ${reply.exceptionDetails.text}`);
  return reply.result.value as T;
}

export async function recordRuntime(options: CaptureOptions): Promise<void> {
  mkdirSync(options.output, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(options.output, `${new Date().toISOString().replaceAll(":", "-")}-`));
  const files = new CaptureFiles(directory);
  const controller = new AbortController();
  const { signal } = controller;
  let connection: InspectorConnection | undefined;
  let stopped = false;
  let snapshotRequested = false, profileRequested = false;
  let profileIndex = 0, snapshotIndex = 0;
  let failure: unknown;
  const stop = () => { stopped = true; controller.abort(); };
  const input = createInterface({ input: process.stdin });
  input.on("line", line => {
    switch (line.trim()) {
      case "snapshot": snapshotRequested = true; break;
      case "profile": profileRequested = true; break;
      case "stop": stop(); break;
      case "": break;
      default: console.error("Commands: snapshot, profile, stop.");
    }
  });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.info(`Runtime diagnostics: ${directory}`);
  try {
    files.event("connecting", { port: options.port });
    connection = await connectInspector(options.port, signal);
    const { requests } = connection;
    void connection.closed.then(error => { if (!signal.aborted) controller.abort(error); });
    const identity = await evaluate(requests, "({ pid: process.pid, versions: process.versions, platform: process.platform, arch: process.arch })");
    writeFileSync(join(directory, "session.json"), JSON.stringify({
      startedAt: new Date().toISOString(), identity,
      inspectorPort: options.port, intervalMs: options.intervalMs,
      profileIntervalMs: options.profileIntervalMs, samplingInterval: options.samplingInterval,
    }, null, 2) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
    files.event("connected", { identity });
    await requests.post("HeapProfiler.enable");
    await requests.post("HeapProfiler.startSampling", { samplingInterval: options.samplingInterval });
    files.event("sampling.started");
    console.info("Recording. Commands: snapshot, profile, stop. Ctrl+C stops collection.");
    const started = performance.now();
    let previous: ProcessSample | undefined;
    let nextProfile = 0;
    while (!signal.aborted) {
      const reading = performance.now();
      const [heap, current] = await Promise.all([
        requests.post<MemorySample["heap"]>("Runtime.getHeapUsage"),
        // Read Node's own counters over Inspector; no application module or business state is modified.
        evaluate<ProcessSample>(requests, "({ pid: process.pid, uptime: process.uptime(), memory: process.memoryUsage(), cpu: process.cpuUsage() })"),
      ]);
      const now = performance.now();
      files.sample({ time: new Date().toISOString(), elapsedMs: now - started, readDurationMs: now - reading,
        process: current, heap, cpuPercent: cpuPercent(previous, current) });
      previous = current;
      if (snapshotRequested) {
        snapshotRequested = false;
        const name = `snapshot-${String(++snapshotIndex).padStart(4, "0")}.heapsnapshot`;
        files.event("snapshot.started", { file: name });
        await saveHeapSnapshot(requests, join(directory, name));
        files.event("snapshot.saved", { file: name });
        console.info(`Saved ${name}`);
      }
      if (profileRequested || performance.now() >= nextProfile) {
        profileRequested = false;
        const { profile } = await requests.post<HeapProfiler.GetSamplingProfileReturnType>("HeapProfiler.getSamplingProfile");
        const name = `profile-${String(++profileIndex).padStart(4, "0")}.heapprofile`;
        saveProfile(join(directory, name), profile);
        files.event("profile.saved", { file: name });
        nextProfile = performance.now() + options.profileIntervalMs;
      }
      await delay(options.intervalMs, undefined, { signal });
    }
    signal.throwIfAborted();
  } catch (error) {
    if (!stopped) {
      failure = signal.aborted ? signal.reason : error;
      files.event("failed", { message: failure instanceof Error ? failure.message : String(failure) });
    }
  } finally {
    controller.abort();
    connection?.close();
    input.close();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    try { files.event("ended", { reason: stopped ? "stopped" : "failed" }); }
    finally { files.close(); }
    console.info(`Capture finished: ${directory}`);
  }
  if (failure !== undefined) throw failure;
}

if (resolve(process.argv[1] ?? "") === resolve(import.meta.filename)) {
  try {
    const options = captureOptions(process.argv.slice(2));
    if (options.help) console.info(help);
    else await recordRuntime(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
