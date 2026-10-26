/**
 * 数字输入的纯计算：解析用户文本、限制范围与精度、按步长调整与显示格式化。
 * 解析不依赖语言区域：全角字符经 NFKC 归一，逗号与句点均视为小数点，便于中文输入法与习惯不同的用户。
 */

/** 返回 null 表示空输入，undefined 表示无法解析。 */
export function parseNumberText(text: string): number | null | undefined {
  const normalized = text.normalize("NFKC").trim().replace(/[,，]/gu, ".");
  if (normalized === "") return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/u.test(normalized)) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/** 舍入到指定小数位并限制范围；舍入同时消除 12.1 + 0.1 之类的浮点尾数。 */
export function limitNumber(value: number, min: number, max: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.min(max, Math.max(min, Math.round(value * scale) / scale));
}

export function stepNumber(value: number, delta: number, min: number, max: number, precision: number): number {
  return limitNumber(value + delta, min, max, precision);
}

/** 完整显示小数，不使用千分位。 */
export function formatNumberText(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20, useGrouping: false }).format(value);
}
