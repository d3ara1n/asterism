import { expect, it } from "vitest";
import { captureOptions, cpuPercent, type ProcessSample } from "./options.ts";

it("converts independent fractional second intervals to milliseconds without truncation", () => {
  const options = captureOptions(["--interval", "0.25", "--profile-interval", "2.5", "--port", "9241"]);
  expect([options.intervalMs, options.profileIntervalMs, options.port]).toEqual([250, 2500, 9241]);
});

it("rejects intervals that would busy-loop or overflow Node timers and invalid sampling sizes", () => {
  for (const args of [
    ["--interval", "0"], ["--interval", "Infinity"], ["--profile-interval", "2147484"],
    ["--sampling-interval", "-1"], ["--sampling-interval", "0.5"],
  ]) expect(() => captureOptions(args)).toThrow();
});

const sample = (uptime: number, user: number, system: number) => ({ uptime, cpu: { user, system } }) as ProcessSample;

it("computes CPU from both cumulative counters over elapsed target time, allowing more than one core", () => {
  expect(cpuPercent(sample(10, 100_000, 200_000), sample(12, 4_100_000, 2_200_000))).toBe(300);
  expect(cpuPercent(sample(10, 100_000, 200_000), sample(14, 600_000, 700_000))).toBe(25);
});

it("leaves CPU unknown until a time delta exists instead of reporting a bogus zero or infinity", () => {
  expect(cpuPercent(undefined, sample(10, 100, 200))).toBeNull();
  expect(cpuPercent(sample(10, 100, 200), sample(10, 200, 300))).toBeNull();
});
