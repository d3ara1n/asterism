import { z } from "zod";
import { defineMessages, pluginNamespace, withValues, type UiText } from "@atelier/sdk/contracts";
import type { PluginContext } from "@atelier/sdk/runtime";
export const namespace = pluginNamespace("example.counter");
/** 公共导出保持来源；普通字符串无需目录或初始化。 */
export const messages = namespace.messages("en", defineMessages({
  title: { id: "counter.title", defaultMessage: "Counter" },
  items: { id: "counter.items", defaultMessage: "{count, plural, one {# item} other {# items}}", description: "Number of items in the counter" },
  limit: { id: "counter.limit", defaultMessage: "Limit" },
  exceeded: { id: "counter.exceeded", defaultMessage: "The limit is {limit, number}." },
}));
export const plainLabel: UiText = "Counter";
export const summary = withValues(messages.items, { count: 3 });
/** 仅后台插件也可以声明可翻译的配置；固定路径遵循 JSON Pointer。 */
export function configure(plugin: PluginContext) {
  return plugin.config(z.object({ limit: z.number().int().positive() }), { limit: 20 }, {
    presentation: { fields: { "/limit": { title: messages.limit } } },
  });
}
