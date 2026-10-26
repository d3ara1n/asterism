import { z } from "zod";
import { defineMessages, pluginNamespace, withValues, type UiText } from "@asterism/sdk/contracts";
import type { PluginContext } from "@asterism/sdk/runtime";
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
/** 配置独立于页面布局，页面通过 useI18n 格式化上述消息。 */
export const CounterConfig = namespace.config(z.object({ limit: z.number().int().positive() }), { limit: 20 });
export function configure(plugin: PluginContext) {
  return plugin.config(CounterConfig);
}
