import { usagePeriodParts, type UsageItem, type UsageUnit } from "./provider-usage.ts";
import type { I18n } from "./renderer-i18n.ts";

/** Compact output abbreviates large amounts for tight surfaces while small amounts keep their cents. */
const numberOptions = (value: number, compact: boolean): Intl.NumberFormatOptions => compact
  ? { notation: "compact", maximumFractionDigits: Math.abs(value) < 1000 ? 2 : 1 } : { maximumFractionDigits: 2 };

export function formatUsageAmount(i18n: I18n, value: number, unit: UsageUnit, options: { compact?: boolean } = {}): string {
  const compact = options.compact === true;
  if (unit.type === "currency") return i18n.formatNumber(value, { style: "currency", currency: unit.code, ...(compact && numberOptions(value, true)) });
  const number = i18n.formatNumber(value, numberOptions(value, compact));
  return unit.type === "symbol" ? `${unit.symbol} ${number}` : `${number} ${i18n.text(unit.label)}`;
}
/** Counts state their label once after both numbers; currencies and symbols mark each amount. */
export function formatUsageQuantity(i18n: I18n, remaining: number, limit: number, unit: UsageUnit): string {
  if (unit.type === "count") return `${i18n.formatNumber(remaining)} / ${i18n.formatNumber(limit)} ${i18n.text(unit.label)}`;
  return `${formatUsageAmount(i18n, remaining, unit)} / ${formatUsageAmount(i18n, limit, unit)}`;
}
/** Narrow units read as 5h or 1w; months use the short form because the narrow month collides with minutes. */
export function formatUsagePeriod(i18n: I18n, seconds: number): string {
  const { value, unit } = usagePeriodParts(seconds);
  return i18n.formatNumber(value, { style: "unit", unit, unitDisplay: unit === "month" ? "short" : "narrow", maximumFractionDigits: 1 });
}
export function usageItemLabel(i18n: I18n, item: UsageItem): string {
  if (item.type === "balance") return i18n.text(item.label);
  const period = item.window.periodSeconds === null ? null : formatUsagePeriod(i18n, item.window.periodSeconds);
  return [item.label === undefined ? null : i18n.text(item.label), period].filter(part => part !== null).join(" · ");
}
