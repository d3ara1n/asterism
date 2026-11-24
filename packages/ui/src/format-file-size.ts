import type { I18n } from "@asterism-app/sdk/renderer";

const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

/** Scale bytes in IEC units before localizing the number. */
export function formatFileSize(i18n: Pick<I18n, "formatNumber">, bytes: number): string {
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const number = i18n.formatNumber(value, { maximumFractionDigits: unit === 0 ? 0 : 1 });
  return `${number}\u00a0${units[unit]}`;
}
