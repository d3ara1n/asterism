import type { I18n } from "@asterism-app/sdk/renderer";
import { formatCount } from "@asterism-app/ui/format-count";
import { thinkingLabels } from "@asterism-app/ui/messages/model-selection";
import type { TelemetryGroup } from "../../../shared/telemetry";
import { folderColorSchema, type FolderColor } from "../../../shared/folders";
import { dashboardMessages as msg } from "../../messages/dashboard";
import type { Measure } from "./metrics";

const dash = "—";

/** USD with precision that keeps small request costs readable. */
export function formatUsd(i18n: I18n, amount: number | null | undefined, compact = false): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return dash;
  const abs = Math.abs(amount);
  if (compact && abs >= 1_000) return i18n.formatNumber(amount, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
  const digits = abs === 0 || abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
  return i18n.formatNumber(amount, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function formatCurrency(i18n: I18n, amount: number, currency: string): string {
  try { return i18n.formatNumber(amount, { style: "currency", currency, maximumFractionDigits: 4 }); }
  catch { return `${i18n.formatNumber(amount, { maximumFractionDigits: 4 })} ${currency}`; }
}
export const formatTokens = (value: number | null | undefined) => value === null || value === undefined ? dash : formatCount(value);
export const formatInteger = (i18n: I18n, value: number | null | undefined) => value === null || value === undefined ? dash : i18n.formatNumber(Math.round(value));
export const formatPercent = (i18n: I18n, ratio: number | null | undefined, digits = 1) =>
  ratio === null || ratio === undefined || !Number.isFinite(ratio) ? dash : i18n.formatNumber(ratio, { style: "percent", maximumFractionDigits: digits });

/** Durations in the largest fitting units: 850 ms, 2.4 s, 3 min 12 s, 4 h 5 min. */
export function formatDuration(i18n: I18n, ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return dash;
  const unit = (value: number, unit: string, digits = 0) => i18n.formatNumber(value, { style: "unit", unit, unitDisplay: "narrow", maximumFractionDigits: digits });
  if (ms < 1_000) return unit(ms, "millisecond");
  if (ms < 60_000) return unit(ms / 1_000, "second", ms < 10_000 ? 1 : 0);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${unit(minutes, "minute")} ${unit(Math.round(ms % 60_000 / 1_000), "second")}`;
  return `${unit(Math.floor(minutes / 60), "hour")} ${unit(minutes % 60, "minute")}`;
}

export function formatMeasure(i18n: I18n, measure: Measure, value: number, compact = false): string {
  return measure === "costUsd" ? formatUsd(i18n, value, compact) : measure === "totalTokens" ? formatTokens(value) : formatInteger(i18n, value);
}
export const measureLabels = { costUsd: msg.cost, totalTokens: msg.tokens, requests: msg.requests } as const;

export function formatRelative(i18n: I18n, at: number | null, now = Date.now()): string {
  if (at === null) return dash;
  const seconds = Math.round((at - now) / 1000);
  const format = new Intl.RelativeTimeFormat(i18n.locale, { numeric: "auto" });
  for (const [limit, unit, size] of [[60, "second", 1], [3_600, "minute", 60], [86_400, "hour", 3_600], [2_592_000, "day", 86_400]] as const)
    if (Math.abs(seconds) < limit) return format.format(Math.round(seconds / size), unit);
  return i18n.formatDate(at, { month: "short", day: "numeric", year: new Date(at).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}

export function folderColor(color: string | null): FolderColor | null {
  const parsed = folderColorSchema.safeParse(color);
  return parsed.success ? parsed.data : null;
}

/** Display name of a dimension value; live names first, recorded snapshots after deletion. */
export function groupLabel(i18n: I18n, group: TelemetryGroup): string {
  switch (group.dimension) {
    case "model": return group.modelId;
    case "provider": return group.providerName;
    case "folder": return group.folderId === null ? i18n.text(msg.noFolder) : group.name ?? group.folderId.slice(0, 8);
    case "session": return group.title ?? i18n.text(msg.untitled);
    case "purpose": return group.purposeId ?? i18n.text(msg.noPurpose);
    case "plugin": return group.name ? i18n.text(group.name) : group.pluginId;
    case "thinking": return group.level === null ? i18n.text(msg.defaultThinking)
      : group.level in thinkingLabels ? i18n.text(thinkingLabels[group.level as keyof typeof thinkingLabels]) : group.level;
    case "error": return group.code ?? i18n.text(msg.unknownError);
    case "other": return i18n.text(msg.other);
  }
}
/** Secondary identification shown under or beside the label. */
export function groupDetail(group: TelemetryGroup): string | null {
  if (group.dimension === "model") return group.providerName;
  if (group.dimension === "session") return group.folderId === null ? null : group.folderName;
  if (group.dimension === "error") return group.origin;
  return null;
}
export function groupColor(group: TelemetryGroup): FolderColor | null {
  if (group.dimension === "folder") return folderColor(group.color);
  if (group.dimension === "session") return folderColor(group.folderColor);
  return null;
}

/** Chart category colors cycle through the theme palette; folder series use folder colors. */
export const chartColor = (index: number) => `var(--chart-${index % 9 + 1})`;
export function seriesColor(group: TelemetryGroup, index: number): string {
  if (group.dimension === "other") return "var(--muted-foreground)";
  const color = groupColor(group);
  return group.dimension === "folder" && color ? `var(--folder-${color})` : chartColor(index);
}
