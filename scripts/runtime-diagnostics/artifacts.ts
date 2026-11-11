import { closeSync, openSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HeapProfiler } from "node:inspector";
import type { InspectorRequests } from "./inspector.ts";
import type { ProcessSample } from "./options.ts";

/** Only complete profiles have the standard extension; interrupted writes remain visibly partial. */
export function saveProfile(path: string, profile: HeapProfiler.SamplingHeapProfile): void {
  writeFileSync(`${path}.partial`, JSON.stringify(profile), { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(`${path}.partial`, path);
}

/** Snapshot chunks go straight to disk instead of accumulating a second heap in the collector. */
export async function saveHeapSnapshot(requests: InspectorRequests, path: string): Promise<void> {
  const fd = openSync(`${path}.partial`, "wx", 0o600);
  requests.notification = event => {
    if (event.method === "HeapProfiler.addHeapSnapshotChunk") writeFileSync(fd, event.params.chunk as string);
  };
  try { await requests.post("HeapProfiler.takeHeapSnapshot", { reportProgress: false }); }
  finally { requests.notification = undefined; closeSync(fd); }
  renameSync(`${path}.partial`, path);
}

export interface MemorySample {
  time: string;
  elapsedMs: number;
  readDurationMs: number;
  process: ProcessSample;
  heap: { usedSize: number; totalSize: number; embedderHeapUsedSize?: number; backingStorageSize?: number };
  cpuPercent: number | null;
}

/** NDJSON preserves completed lines after interruption; the companion trace opens as counters in Perfetto. */
export class CaptureFiles {
  private readonly events: number;
  private readonly memory: number;
  private readonly trace: number;
  constructor(directory: string) {
    this.events = openSync(join(directory, "events.ndjson"), "wx", 0o600);
    this.memory = openSync(join(directory, "memory.ndjson"), "wx", 0o600);
    this.trace = openSync(join(directory, "memory.trace.json"), "wx", 0o600);
    writeFileSync(this.trace, '{"traceEvents":[{"ph":"M","name":"process_name","pid":1,"tid":0,"args":{"name":"Task runtime"}}');
  }
  event(type: string, detail: Record<string, unknown> = {}): void {
    writeFileSync(this.events, `${JSON.stringify({ time: new Date().toISOString(), type, ...detail })}\n`);
  }
  sample(sample: MemorySample): void {
    writeFileSync(this.memory, `${JSON.stringify(sample)}\n`);
    // A single target per capture uses trace-local PID 1; the actual PID is retained in session and sample data.
    const base = { ph: "C", pid: 1, tid: 0, ts: sample.elapsedMs * 1000 };
    writeFileSync(this.trace, `,${JSON.stringify({ ...base, name: "Memory (bytes)", args: sample.process.memory })}`);
    if (sample.cpuPercent !== null)
      writeFileSync(this.trace, `,${JSON.stringify({ ...base, name: "CPU (% of one core)", args: { cpu: sample.cpuPercent } })}`);
  }
  close(): void {
    try { writeFileSync(this.trace, ']}\n'); }
    finally { closeSync(this.trace); closeSync(this.memory); closeSync(this.events); }
  }
}
