import { messageValuesSchema, type UiMessage, type UiText, type MessageValues } from "@asterism/sdk/contracts";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { createIntl, createIntlCache, type IntlShape } from "@formatjs/intl";
import { match } from "@formatjs/intl-localematcher";

export interface TranslationCatalog {
  owner: string;
  locale: string;
  revision: string;
  messages: Record<string, string>;
}

interface ResolvedMessage {
  locale: string;
  message: string;
  revision: string;
}

export function canonicalLocale(value: string): string | null {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? null;
  } catch {
    return null;
  }
}

function compatible(request: string, candidate: string): boolean {
  const requested = new Intl.Locale(request).maximize();
  const available = new Intl.Locale(candidate).maximize();
  return requested.language === available.language && requested.script === available.script;
}

/** Filter by language/script first, then let the established matcher select regions. */
export function matchLocale(request: string, available: readonly string[]): string | null {
  const locale = canonicalLocale(request);
  if (!locale) return null;
  const candidates = available
    .filter(value => canonicalLocale(value) && compatible(locale, value))
    .sort((a, b) => Number(!!new Intl.Locale(a).region) - Number(!!new Intl.Locale(b).region));
  if (!candidates.length) return null;
  return candidates.includes(locale) ? locale : match([locale], candidates, candidates[0]!);
}

export function resolveLanguage(preference: string, system: readonly string[]): { locale: string; interfaceLocale: string } {
  for (const request of preference === "system" ? system : [preference]) {
    const locale = canonicalLocale(request);
    if (!locale) continue;
    const selected = matchLocale(locale, ["en", "zh-Hans"]);
    if (selected) return { locale, interfaceLocale: selected };
  }
  return { locale: "en", interfaceLocale: "en" };
}

/** ICU AST determines parameter types; rich-text tags stay outside pure-data messages. */
export function messageParameters(message: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const visit = (items: MessageFormatElement[]) => {
    for (const item of items) {
      if (item.type === TYPE.literal || item.type === TYPE.pound) continue;
      const kind = item.type === TYPE.tag ? "tag"
        : item.type === TYPE.select ? "select"
        : item.type === TYPE.argument ? "scalar"
        : item.type === TYPE.date || item.type === TYPE.time ? "date" : "number";
      const types = result.get(item.value) ?? new Set<string>();
      types.add(kind);
      result.set(item.value, types);
      if (item.type === TYPE.select || item.type === TYPE.plural) {
        Object.values(item.options).forEach(option => visit(option.value));
      }
      if (item.type === TYPE.tag) visit(item.children);
    }
  };
  visit(parse(message));
  return result;
}

export function compatibleMessage(source: string, translation: string): boolean {
  const sourceParameters = messageParameters(source);
  const translatedParameters = messageParameters(translation);
  if (sourceParameters.size !== translatedParameters.size) return false;
  return [...sourceParameters].every(([name, types]) => translatedParameters.has(name)
    && [...translatedParameters.get(name)!].every(type => types.has(type) || type === "scalar" && !types.has("tag")));
}

export class MessageFormatter {
  readonly locale: string;
  readonly catalogs: readonly TranslationCatalog[];
  private readonly diagnose: (message: string) => void;
  private readonly cache = createIntlCache();
  private readonly engines = new Map<string, IntlShape>();
  private readonly declarations = new Map<string, string>();
  private readonly resolved = new Map<string, ResolvedMessage>();

  constructor(
    locale: string,
    catalogs: readonly TranslationCatalog[] = [],
    diagnose: (message: string) => void = message => console.warn(message),
  ) {
    this.locale = locale;
    this.catalogs = catalogs;
    this.diagnose = diagnose;
  }

  private engine(locale: string, revision = "source"): IntlShape {
    const key = `${locale}/${revision}`;
    let intl = this.engines.get(key);
    if (!intl) {
      intl = createIntl({
        locale,
        defaultLocale: locale,
        messages: {},
        onError: error => { throw error; },
      }, this.cache);
      this.engines.set(key, intl);
    }
    return intl;
  }

  /** Rich-text callers share this parse result to keep each complete message in one language. */
  resolve(message: UiMessage): ResolvedMessage {
    const key = `${message.owner}/${message.id}`;
    const previous = this.declarations.get(key);
    if (previous && previous !== message.defaultMessage) this.diagnose(`Conflicting default message: ${key}.`);
    this.declarations.set(key, message.defaultMessage);
    const catalogs = this.catalogs.filter(catalog => catalog.owner === message.owner);
    const selected = matchLocale(this.locale, catalogs.map(catalog => catalog.locale));
    const catalog = catalogs.find(catalog => catalog.locale === selected);
    const translation = catalog?.messages[message.id];
    const cacheKey = JSON.stringify([
      message.owner, message.id, message.sourceLocale, message.defaultMessage, selected, catalog?.revision,
    ]);
    const cached = this.resolved.get(cacheKey);
    if (cached) return cached;
    if (translation && catalog) {
      try {
        if (compatibleMessage(message.defaultMessage, translation)) {
          const resolved = { locale: catalog.locale, message: translation, revision: `${message.owner}/${catalog.revision}` };
          this.resolved.set(cacheKey, resolved);
          return resolved;
        }
      } catch { /* Fall back for this invalid translation only. */ }
      this.diagnose(`Invalid translation: ${key} (${selected}).`);
    }
    const resolved = { locale: message.sourceLocale, message: message.defaultMessage, revision: `${message.owner}/source` };
    this.resolved.set(cacheKey, resolved);
    return resolved;
  }

  formatMessage(message: UiMessage, values?: MessageValues): string {
    const selected = this.resolve(message);
    const parameters = { ...message.values, ...values };
    if (!messageValuesSchema.safeParse(parameters).success) {
      this.diagnose(`Invalid message parameters: ${message.owner}/${message.id}.`);
      return message.defaultMessage;
    }
    try {
      return this.engine(selected.locale, selected.revision).formatMessage(
        { id: message.id, defaultMessage: selected.message }, parameters,
      );
    } catch {
      this.diagnose(`Message formatting failed: ${message.owner}/${message.id}.`);
    }
    try {
      return this.engine(message.sourceLocale, `${message.owner}/source`).formatMessage(
        { id: message.id, defaultMessage: message.defaultMessage }, parameters,
      );
    } catch {
      this.diagnose(`Default message formatting failed: ${message.owner}/${message.id}.`);
      return message.defaultMessage;
    }
  }

  text(value: UiText): string {
    return typeof value === "string" ? value : this.formatMessage(value);
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale, options).format(value);
  }

  formatDate(value: number, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale, options).format(value);
  }
}
