/**
 * Pure calculations for number input: parse user text, constrain range and precision, adjust by step, and format for display.
 * Parsing is locale-independent: full-width characters are normalized with NFKC, and commas and periods both count as decimal separators to accommodate Chinese input methods and differing user conventions.
 */

/** Returns null for empty input and undefined for unparseable input. */
export function parseNumberText(text: string): number | null | undefined {
  const normalized = text.normalize("NFKC").trim().replace(/[,，]/gu, ".");
  if (normalized === "") return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/u.test(normalized)) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/** Round to the specified decimal places and clamp to the range; rounding also removes floating-point artifacts such as those from 12.1 + 0.1. */
export function limitNumber(value: number, min: number, max: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.min(max, Math.max(min, Math.round(value * scale) / scale));
}

export function stepNumber(value: number, delta: number, min: number, max: number, precision: number): number {
  return limitNumber(value + delta, min, max, precision);
}

/** Display all decimal places without thousands separators. */
export function formatNumberText(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20, useGrouping: false }).format(value);
}
