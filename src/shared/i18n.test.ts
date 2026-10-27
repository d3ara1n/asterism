import { describe, expect, it } from "vitest";
import { defineMessages, pluginNamespace, uiTextSchema, withValues } from "@asterism-app/sdk/contracts";
import { MessageFormatter, compatibleMessage, matchLocale, resolveLanguage } from "./i18n.ts";
const ns = pluginNamespace("example.counter");
const messages = ns.messages("en", defineMessages({
  items: { id: "items", defaultMessage: "{count, plural, one {# item} other {# items}}" },
  date: { id: "date", defaultMessage: "{date, date, short}" },
}));
const catalog = (owner: string, locale: string, translations: Record<string, string>, revision = "1") => ({ owner, locale, revision, messages: translations });

describe("Public UI messages and language fallback", () => {
  it("whole ICU messages preserve braces in user titles without interpreting user text as message syntax", () => {
    const message = ns.messages("en", defineMessages({ draft: { id: "draft", defaultMessage: "Draft: {title}" } })).draft;
    const title = "My {draft}", translated = catalog(ns.id, "zh-Hans", { draft: "草稿：{title}" });
    expect(new MessageFormatter("en").formatMessage(message, { title })).toBe("Draft: My {draft}");
    expect(new MessageFormatter("zh-Hans", [translated]).formatMessage(message, { title })).toBe("草稿：My {draft}");
  });
  it.each([
    ["system", ["zh-Hant-TW", "zh-Hans-CN", "en"], "zh-Hans-CN", "zh-Hans"],
    ["system", ["zh-TW", "zh-HK", "zh-MO"], "en", "en"],
    ["system", ["zh-SG"], "zh-SG", "zh-Hans"],
    ["system", ["zh"], "zh", "zh-Hans"],
    ["en-GB", ["zh-Hans"], "en-GB", "en"],
    ["zh-TW", ["zh-Hans"], "en", "en"],
  ])("resolves each item: %s %j", (preference, system, locale, interfaceLocale) => {
    expect(resolveLanguage(preference, system as string[])).toEqual({ locale, interfaceLocale });
  });
  it("normalizes languages, preserves owners and immutable parameters, and rejects functions or infinite numbers over IPC", () => {
    const shared = ns.messages("EN-us", { title: { id: "title", defaultMessage: "Counter" } }).title;
    expect(shared.sourceLocale).toBe("en-US");
    expect(uiTextSchema.parse(structuredClone(shared))).toEqual(shared);
    const bound = withValues(messages.items, { count: 3 });
    expect(messages.items.values).toBeUndefined(); expect(bound.owner).toBe(ns.id);
    expect(() => withValues(shared, { count: Infinity })).toThrow();
    expect(uiTextSchema.safeParse({ ...shared, values: { count: () => 3 } }).success).toBe(false);
    expect(() => ns.messages("invalid_locale", { title: { id: "title", defaultMessage: "Counter" } })).toThrow();
  });
  it("falls back per message, isolates owners, and keeps corrupt translations from affecting other messages", () => {
    const formatter = new MessageFormatter("zh-Hans", [catalog(ns.id, "zh-Hans", { items: "{count} 项", date: "{date, date, short}" }),
      catalog("another.plugin", "zh-Hans", { items: "另外 {count} 项" })], () => {});
    expect(formatter.formatMessage(messages.items, { count: 3 })).toBe("3 项");
    const foreign = pluginNamespace("another.plugin").messages("en", { items: messages.items }).items;
    expect(formatter.formatMessage(foreign, { count: 3 })).toBe("另外 3 项");
    expect(formatter.formatMessage(withValues(messages.items, { count: 3 }), { count: 1 })).toBe("1 项");
    expect(formatter.text("items")).toBe("items");
    const absent = pluginNamespace("missing.plugin").messages("en", { items: messages.items }).items;
    expect(formatter.formatMessage(absent, { count: 1 })).toBe("1 item");
    for (const translated of ["{broken", "{other}", "{count, date, short}"])
      expect(new MessageFormatter("zh-Hans", [catalog(ns.id, "zh-Hans", { items: translated })], () => {})
        .formatMessage(messages.items, { count: 2 })).toBe("2 items");
    expect(formatter.formatMessage(messages.items)).toBe(messages.items.defaultMessage);
  });
  it("default copy plurals and nested numbers retain source languages while independent formatting retains locale", () => {
    const russian = ns.messages("ru", { plural: { id: "ru", defaultMessage: "{count, plural, one {one #} few {few #} many {many #} other {other #}}" } }).plural;
    const formatter = new MessageFormatter("en-GB", [], () => {});
    expect(formatter.formatMessage(russian, { count: 2 })).toBe("few 2");
    const translated = new MessageFormatter("en-GB", [catalog(ns.id, "en", { ru: "{count, plural, one {one #} other {other #}}" })]);
    expect(translated.formatMessage(russian, { count: 2 })).toBe("other 2");
    const epoch = Date.UTC(2024, 0, 2, 12);
    expect(formatter.formatMessage(messages.date, { date: epoch })).not.toBe(formatter.formatDate(epoch, { dateStyle: "short", timeZone: "UTC" }));
    const german = new MessageFormatter("zh-Hans", [catalog(ns.id, "zh-Hans", { items: "{count} 项" })]);
    expect(german.formatMessage(messages.items, { count: 1000 })).toBe("1000 项");
  });
  it("exact catalogs take precedence without incompatible scripts; catalog revisions and declaration conflicts affect presentation only", () => {
    expect(matchLocale("zh-TW", ["zh-Hans"])).toBeNull();
    expect(matchLocale("en-GB", ["en", "en-GB"])).toBe("en-GB");
    const diagnostics: string[] = [], first = new MessageFormatter("zh-Hans", [catalog(ns.id, "zh-Hans", { items: "{count} 项" })], message => diagnostics.push(message));
    expect(first.formatMessage(messages.items, { count: 3 })).toBe("3 项");
    const next = new MessageFormatter("zh-Hans", [catalog(ns.id, "zh-Hans", { items: "共 {count} 项" }, "2")]);
    expect(next.formatMessage(messages.items, { count: 3 })).toBe("共 3 项");
    first.formatMessage({ ...messages.items, defaultMessage: "{count} things" }, { count: 3 });
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(compatibleMessage("{count, plural, one {# item} other {# items}}", "{count} 项")).toBe(true);
    expect(first.formatMessage(messages.items, { count: Infinity })).toBe(messages.items.defaultMessage);
  });
});
