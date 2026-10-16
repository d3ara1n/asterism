import type { I18n } from "@atelier/sdk/renderer";
import { diagnosticMessages as messages } from "../../messages/diagnostics";

export function formatMoney(i18n: I18n, amount: number): string {
  const options = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 8 } as const;
  return amount > 0 && amount < 0.00000001 ? `< ${i18n.formatNumber(0.00000001, options)}` : i18n.formatNumber(amount, options);
}
export function formatEstimate(i18n: I18n, amount: number | null, partial = false): string {
  return amount === null ? i18n.text(messages.unknown) : i18n.formatMessage(partial ? messages.partialEstimate : messages.estimate, { amount: formatMoney(i18n, amount) });
}
