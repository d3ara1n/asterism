import { I18nProvider, useI18n, type I18n } from "@atelier/sdk/renderer";
import { createElement, useSyncExternalStore, type ReactNode } from "react";
import { createIntl, createIntlCache, RawIntlProvider } from "react-intl";

import builtinChinese from "@atelier/builtin/locales/zh-Hans.json";
import { hostCatalog } from "../../shared/host-catalog";
import { MessageFormatter, type TranslationCatalog } from "../../shared/i18n";
import type { LanguageState, LanguageBridge } from "../../shared/language";

export { useI18n };

let language: LanguageState = { preference: "system", locale: "en", interfaceLocale: "en" };
let catalogs: TranslationCatalog[] = [];
let revision = 0;
const listeners = new Set<() => void>();

function environment(): I18n {
  const formatter = new MessageFormatter(language.locale, [
    hostCatalog,
    { owner: "atelier.builtin", locale: "zh-Hans", revision: "builtin", messages: builtinChinese },
    ...catalogs,
  ]);
  return {
    ...language,
    revision,
    text: value => formatter.text(value),
    formatMessage: (message, values) => formatter.formatMessage(message, values),
    formatNumber: (value, options) => formatter.formatNumber(value, options),
    formatDate: (value, options) => formatter.formatDate(value, options),
    resolve: message => formatter.resolve(message),
  };
}

let current = environment();

/** 宿主非 React 展示计算；插件通过公开 hook 取得同一展示环境。 */
export const getI18n = (): I18n => current;

/** 插件目录到达时补充语言环境；主进程语言只在启动页读取和订阅一次。 */
export function setLanguageCatalogs(entries: readonly TranslationCatalog[]): void {
  catalogs = [...entries];
  publish();
}

function publish(): void {
  revision++;
  current = environment();
  if (typeof document !== "undefined") document.documentElement.lang = language.locale;
  listeners.forEach(listener => listener());
}

export async function startLanguage(
  entries: readonly TranslationCatalog[],
  bridge: LanguageBridge = window.host.language,
): Promise<() => void> {
  catalogs = [...entries];
  // 先订阅再读取，直接采用收到的当前值。
  const stop = bridge.onChanged(value => {
    if (value.preference === language.preference
      && value.locale === language.locale
      && value.interfaceLocale === language.interfaceLocale) return;
    language = value;
    publish();
  });
  try {
    language = await bridge.get();
    publish();
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const cache = createIntlCache();

export function HostI18nProvider({ children }: { children: ReactNode }) {
  const value = useSyncExternalStore(subscribe, getI18n);
  const intl = createIntl({
    locale: value.locale,
    messages: {},
    onError: error => console.warn("UI formatting failed.", error),
  }, cache);
  return createElement(RawIntlProvider, { value: intl }, createElement(I18nProvider, { value, children }));
}
