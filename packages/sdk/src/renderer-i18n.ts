import { createContext, createElement, useContext, type ReactNode } from "react";
import { createIntl, createIntlCache, RawIntlProvider, FormattedMessage } from "react-intl";

import type { UiText, UiMessage, MessageValues } from "./i18n.ts";

export interface I18n {
  readonly locale: string;
  readonly interfaceLocale: string;
  readonly revision: number;
  text(value: UiText): string;
  formatMessage(message: UiMessage, values?: MessageValues): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatDate(value: number, options?: Intl.DateTimeFormatOptions): string;
  resolve(message: UiMessage): { locale: string; message: string; revision: string };
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ value, children }: { value: I18n; children: ReactNode }) {
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("The renderer requires the host I18nProvider.");
  return value;
}

const cache = createIntlCache();

/** 富文本映射只留在 React；默认文案仍由标准 defineMessages 声明和抽取。 */
export function UiFormattedMessage({ message, values }: {
  message: UiMessage;
  values?: Record<string, string | number | boolean | ((chunks: ReactNode[]) => ReactNode)>;
}) {
  const i18n = useI18n();
  const selected = i18n.resolve(message);
  const intl = createIntl({
    locale: selected.locale,
    defaultLocale: message.sourceLocale,
    messages: { [message.id]: selected.message },
    onError: error => console.warn("Rich text message formatting failed.", error),
  }, cache);
  return createElement(RawIntlProvider, { value: intl }, createElement(FormattedMessage, {
    id: message.id,
    defaultMessage: message.defaultMessage,
    values: { ...message.values, ...values },
  }));
}
