import type { I18n } from "@atelier/sdk/renderer";
import type { UnitPrice } from "@atelier/sdk/contracts";
import { formatCount } from "@atelier/ui/format-count";
import { diagnosticMessages as messages } from "../../messages/diagnostics";
import { performanceMessages } from "../../messages/performance";

export const formatDuration = (i18n: I18n, ms: number | null | undefined) => ms == null ? "—"
  : i18n.formatMessage(performanceMessages.seconds, { value: i18n.formatNumber(ms / 1000, { maximumFractionDigits: 3 }) });

export function formatMoney(i18n: I18n, amount: number): string {
  const options = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 8 } as const;
  return amount > 0 && amount < 0.00000001 ? `< ${i18n.formatNumber(0.00000001, options)}` : i18n.formatNumber(amount, options);
}
/** token 基数使用统一工程缩写，其他计费单位保留其原始数值尺度。 */
export function formatQuantity(i18n: I18n, value: number, unit: UnitPrice["unit"]): string {
  return unit === "token" ? formatCount(value) : i18n.formatNumber(value);
}
export function formatPrice(i18n: I18n, price: UnitPrice): string {
  return i18n.formatMessage(messages.rate, {
    amount: formatMoney(i18n, price.amount),
    count: formatQuantity(i18n, price.per, price.unit),
    unit: i18n.text(messages[price.unit]),
  });
}
export function formatEstimate(i18n: I18n, amount: number | null, partial = false): string {
  return amount === null ? i18n.text(messages.unknown) : i18n.formatMessage(partial ? messages.partialEstimate : messages.estimate, { amount: formatMoney(i18n, amount) });
}
