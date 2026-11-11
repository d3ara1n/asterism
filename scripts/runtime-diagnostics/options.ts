import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { inspectorPort } from "../../src/shared/runtime-inspector.ts";

export interface CaptureOptions {
  port: number;
  intervalMs: number;
  profileIntervalMs: number;
  samplingInterval: number;
  output: string;
  help: boolean;
}

function seconds(value: string, option: string): number {
  const milliseconds = Number(value) * 1000;
  if (!Number.isFinite(milliseconds) || milliseconds < 1 || milliseconds > 2_147_483_647)
    throw new Error(`${option} must be positive seconds within Node's timer range (at least 0.001 seconds).`);
  return milliseconds;
}

export function captureOptions(args: string[]): CaptureOptions {
  const { values } = parseArgs({ args, options: {
    port: { type: "string", default: "9230" },
    interval: { type: "string", default: "5" },
    "profile-interval": { type: "string", default: "120" },
    "sampling-interval": { type: "string", default: "131072" },
    output: { type: "string", default: ".local/runtime-diagnostics" },
    help: { type: "boolean", default: false },
  } });
  const samplingInterval = Number(values["sampling-interval"]);
  if (!Number.isSafeInteger(samplingInterval) || samplingInterval <= 0)
    throw new Error("--sampling-interval must be a positive integer number of bytes.");
  return {
    port: inspectorPort(values.port), intervalMs: seconds(values.interval, "--interval"),
    profileIntervalMs: seconds(values["profile-interval"], "--profile-interval"),
    samplingInterval, output: resolve(values.output), help: values.help,
  };
}

export interface ProcessSample {
  pid: number;
  uptime: number;
  memory: { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number };
  cpu: { user: number; system: number };
}

/** CPU time is cumulative microseconds; the percentage uses one logical core as 100%. */
export function cpuPercent(previous: ProcessSample | undefined, current: ProcessSample): number | null {
  if (!previous) return null;
  const elapsed = current.uptime - previous.uptime;
  if (elapsed <= 0) return null;
  return (current.cpu.user - previous.cpu.user + current.cpu.system - previous.cpu.system) / (elapsed * 1_000_000) * 100;
}
