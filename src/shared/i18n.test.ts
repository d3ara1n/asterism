import { describe, expect, it } from "vitest";
import { defineMessages, pluginNamespace, uiTextSchema, withValues } from "@atelier/sdk/contracts";
import { MessageFormatter, compatibleMessage, matchLocale, resolveLanguage } from "./i18n.ts";
import { formsMessages } from "../renderer/messages/forms.ts";
import { hostCatalog } from "./host-catalog.ts";
const ns = pluginNamespace("example.counter");
const messages = ns.messages("en", defineMessages({
  items: { id: "items", defaultMessage: "{count, plural, one {# item} other {# items}}" },
  date: { id: "date", defaultMessage: "{date, date, short}" },
}));
const catalog = (owner: string, locale: string, translations: Record<string, string>, revision = "1") => ({ owner, locale, revision, messages: translations });

describe("公共 UI 消息与语言回退", () => {
  it("配置放弃修改提示用整条 ICU 消息插入用户标题，保留标题中的花括号", () => {
    const title = "My {draft}";
    expect(new MessageFormatter("en").formatMessage(formsMessages.discardDescription, { title }))
      .toBe("Changes in “My {draft}” have not been saved.");
    expect(new MessageFormatter("zh-Hans", [hostCatalog]).formatMessage(formsMessages.discardDescription, { title }))
      .toBe("「My {draft}」中的修改尚未保存。");
  });
  it.each([
    ["system", ["zh-Hant-TW", "zh-Hans-CN", "en"], "zh-Hans-CN", "zh-Hans"],
    ["system", ["zh-TW", "zh-HK", "zh-MO"], "en", "en"],
    ["system", ["zh-SG"], "zh-SG", "zh-Hans"],
    ["system", ["zh"], "zh", "zh-Hans"],
    ["en-GB", ["zh-Hans"], "en-GB", "en"],
    ["zh-TW", ["zh-Hans"], "en", "en"],
  ])("逐项解析 %s %j", (preference, system, locale, interfaceLocale) => {
    expect(resolveLanguage(preference, system as string[])).toEqual({ locale, interfaceLocale });
  });
  it("规范化语言、保持 owner 与不可变参数，IPC 不接收函数或无穷数", () => {
    const shared = ns.messages("EN-us", { title: { id: "title", defaultMessage: "Counter" } }).title;
    expect(shared.sourceLocale).toBe("en-US");
    expect(uiTextSchema.parse(structuredClone(shared))).toEqual(shared);
    const bound = withValues(messages.items, { count: 3 });
    expect(messages.items.values).toBeUndefined(); expect(bound.owner).toBe(ns.id);
    expect(() => withValues(shared, { count: Infinity })).toThrow();
    expect(uiTextSchema.safeParse({ ...shared, values: { count: () => 3 } }).success).toBe(false);
    expect(() => ns.messages("invalid_locale", { title: { id: "title", defaultMessage: "Counter" } })).toThrow();
  });
  it("逐条回退、跨 owner 隔离，坏译文不影响其他消息", () => {
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
  it("默认文案的复数与嵌套数字保持来源语言；独立格式保留地区", () => {
    const russian = ns.messages("ru", { plural: { id: "ru", defaultMessage: "{count, plural, one {one #} few {few #} many {many #} other {other #}}" } }).plural;
    const formatter = new MessageFormatter("en-GB", [], () => {});
    expect(formatter.formatMessage(russian, { count: 2 })).toBe("few 2");
    const translated = new MessageFormatter("en-GB", [catalog(ns.id, "en", { ru: "{count, plural, one {one #} other {other #}}" })]);
    expect(translated.formatMessage(russian, { count: 2 })).toBe("other 2");
    const epoch = Date.UTC(2024, 0, 2, 12);
    expect(formatter.formatMessage(messages.date, { date: epoch })).toBe(new Intl.DateTimeFormat("en", { dateStyle: "short" }).format(epoch));
    expect(formatter.formatDate(Date.UTC(2024, 0, 2, 12), { timeZone: "UTC" })).toBe("02/01/2024");
    const german = new MessageFormatter("zh-Hans", [catalog(ns.id, "zh-Hans", { items: "{count} 项" })]);
    expect(german.formatMessage(messages.items, { count: 1000 })).toBe("1000 项");
  });
  it("精确目录优先，不进入不相容脚本；目录修订与声明冲突只影响展示", () => {
    expect(matchLocale("zh-TW", ["zh-Hans"])).toBeNull();
    expect(matchLocale("en-GB", ["en", "en-GB"])).toBe("en-GB");
    const diagnostics: string[] = [], first = new MessageFormatter("zh-Hans", [catalog(ns.id, "zh-Hans", { items: "{count} 项" })], message => diagnostics.push(message));
    expect(first.formatMessage(messages.items, { count: 3 })).toBe("3 项");
    const next = new MessageFormatter("zh-Hans", [catalog(ns.id, "zh-Hans", { items: "共 {count} 项" }, "2")]);
    expect(next.formatMessage(messages.items, { count: 3 })).toBe("共 3 项");
    first.formatMessage({ ...messages.items, defaultMessage: "{count} things" }, { count: 3 });
    expect(diagnostics.some(message => message.includes("Conflicting default"))).toBe(true);
    expect(compatibleMessage("{count, plural, one {# item} other {# items}}", "{count} 项")).toBe(true);
    expect(first.formatMessage(messages.items, { count: Infinity })).toBe(messages.items.defaultMessage);
  });
});
