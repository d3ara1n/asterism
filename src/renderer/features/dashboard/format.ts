import { z } from "zod";
import { readPreference, writePreference } from "../creation/preferences";

export type DashboardTab = "overview" | "projects" | "models" | "activity" | "tools";
export type RangePreset = "today" | "7d" | "30d" | "90d" | "year" | "all";

const DAY_MS = 86_400_000;
const BUDGET_KEY = "dashboard/monthly-budget";
const RANGE_KEY = "dashboard/range";

const rangeSchema = z.enum(["today", "7d", "30d", "90d", "year", "all"]);
const budgetSchema = z.number().positive().finite();

export function readDashboardRange(): RangePreset {
  const parsed = rangeSchema.safeParse(readPreference(RANGE_KEY));
  return parsed.success ? parsed.data : "30d";
}

export function writeDashboardRange(range: RangePreset): void {
  writePreference(RANGE_KEY, range);
}

export function readMonthlyBudget(): number | null {
  const parsed = budgetSchema.safeParse(readPreference(BUDGET_KEY));
  return parsed.success ? parsed.data : null;
}

export function writeMonthlyBudget(value: number | null): void {
  writePreference(BUDGET_KEY, value !== null && Number.isFinite(value) && value > 0 ? value : null);
}

/** Positive-east UTC offset in minutes (e.g. +480 for UTC+8). */
export function localUtcOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

export function computeRangeBounds(preset: RangePreset, now = Date.now()): { from: number | null; to: number | null } {
  if (preset === "all") return { from: null, to: null };
  const d = new Date(now);
  const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (preset === "today") return { from: startOfToday, to: null };
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : preset === "90d" ? 90 : 365;
  return { from: startOfToday - (days - 1) * DAY_MS, to: null };
}

export function formatUsd(amount: number | null | undefined, compact = false): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs === 0) return "$0.00";
  if (compact && abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  if (abs < 0.01) return `${sign}$${abs.toFixed(4)}`;
  if (abs < 1) return `${sign}$${abs.toFixed(3)}`;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatTokens(count: number | null | undefined): string {
  if (count === null || count === undefined || !Number.isFinite(count)) return "—";
  const abs = Math.abs(count);
  if (abs >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(count / 1_000).toFixed(1)}K`;
  if (abs >= 1_000) return `${(count / 1_000).toFixed(2)}K`;
  return Math.round(count).toLocaleString("en-US");
}

export function formatInteger(count: number | null | undefined): string {
  if (count === null || count === undefined || !Number.isFinite(count)) return "—";
  return Math.round(count).toLocaleString("en-US");
}

export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

export function formatDelta(current: number, previous: number | null | undefined): { text: string; direction: "up" | "down" | "flat" } | null {
  if (previous === null || previous === undefined || previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (!Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.5) return { text: "0%", direction: "flat" };
  return {
    text: `${pct > 0 ? "+" : ""}${Math.round(pct)}%`,
    direction: pct > 0 ? "up" : "down",
  };
}

export function formatShortBucket(bucket: string, granularity: "hour" | "day" | "week" | "month"): string {
  if (granularity === "hour") return bucket.slice(11); // HH:00
  if (granularity === "day" || granularity === "week") return bucket.slice(5); // MM-DD
  return bucket; // YYYY-MM
}

export function formatRelativeTime(ms: number | null | undefined, locale: string): string {
  if (!ms) return "—";
  const diffSec = Math.round((Date.now() - ms) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diffSec < 60) return rtf.format(-diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return rtf.format(-diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return rtf.format(-diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return rtf.format(-diffDay, "day");
  return new Date(ms).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

const CHART_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
] as const;

export function chartColor(index: number): string {
  return CHART_VARS[index % CHART_VARS.length]!;
}

export function folderCssColor(color: string | null | undefined): string {
  return color ? `var(--folder-${color})` : "var(--muted-foreground)";
}
