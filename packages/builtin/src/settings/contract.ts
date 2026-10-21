import { z } from "zod";
import { defineMessages } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const settingsMessages = builtin.messages("en", defineMessages({
  thinking: { id: "settings.thinking", defaultMessage: "Thinking" },
  tools: { id: "settings.tools", defaultMessage: "Tool calls" },
  peek: { id: "settings.peek", defaultMessage: "Agent investigations" },
  reset: { id: "settings.reset", defaultMessage: "Restore defaults" },
  loading: { id: "settings.loading", defaultMessage: "Loading settings…" },
  invalid: { id: "settings.invalid", defaultMessage: "Saved settings could not be read. Default values are shown." },
  saveFailed: { id: "settings.saveFailed", defaultMessage: "Settings could not be saved. Try again." },
  retry: { id: "settings.retry", defaultMessage: "Try again" },
  thinkingAutoExpand: { id: "settings.thinkingAutoExpand", defaultMessage: "Expand thinking while it streams" },
  thinkingAutoCollapse: { id: "settings.thinkingAutoCollapse", defaultMessage: "Collapse thinking when it finishes" },
  toolInputAutoExpand: { id: "settings.toolInputAutoExpand", defaultMessage: "Expand tool input while it streams" },
  toolInputAutoCollapse: { id: "settings.toolInputAutoCollapse", defaultMessage: "Collapse tool input when it finishes" },
  peekAutoExpand: { id: "settings.peekAutoExpand", defaultMessage: "Expand investigation reports while they stream" },
  peekAutoCollapse: { id: "settings.peekAutoCollapse", defaultMessage: "Collapse investigation reports when they finish" },
}));

/** 内置插件的托管配置；页面布局独立于存储契约。 */
// 忽略已移除的选项，保留持久配置中仍有效的偏好。
export const BuiltinSettings = builtin.config(z.object({
  thinkingAutoExpand: z.boolean(), thinkingAutoCollapse: z.boolean(),
  toolInputAutoExpand: z.boolean(), toolInputAutoCollapse: z.boolean(),
  peekAutoExpand: z.boolean().default(true), peekAutoCollapse: z.boolean().default(true),
}), { thinkingAutoExpand: true, thinkingAutoCollapse: true, toolInputAutoExpand: true, toolInputAutoCollapse: true,
  peekAutoExpand: true, peekAutoCollapse: true });
