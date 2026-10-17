import { z } from "zod";
import { defineMessages } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

const messages = builtin.messages("en", defineMessages({
  title: { id: "settings.title", defaultMessage: "Built-in plugin" },
  thinkingAutoExpand: { id: "settings.thinkingAutoExpand", defaultMessage: "Expand thinking while it streams" },
  thinkingAutoCollapse: { id: "settings.thinkingAutoCollapse", defaultMessage: "Collapse thinking when it finishes" },
  toolInputAutoExpand: { id: "settings.toolInputAutoExpand", defaultMessage: "Expand tool input while it streams" },
  toolInputAutoCollapse: { id: "settings.toolInputAutoCollapse", defaultMessage: "Collapse tool input when it finishes" },
}));

/** builtin 插件配置：用户在插件设置页协商；前后台共享同一契约。 */
// 忽略已移除的选项，保留持久配置中仍有效的偏好。
export const BuiltinSettings = builtin.config(z.object({
  thinkingAutoExpand: z.boolean(), thinkingAutoCollapse: z.boolean(),
  toolInputAutoExpand: z.boolean(), toolInputAutoCollapse: z.boolean(),
}), { thinkingAutoExpand: true, thinkingAutoCollapse: true, toolInputAutoExpand: true, toolInputAutoCollapse: true }, {
  presentation: { fields: {
    "": { title: messages.title },
    "/thinkingAutoExpand": { title: messages.thinkingAutoExpand }, "/thinkingAutoCollapse": { title: messages.thinkingAutoCollapse },
    "/toolInputAutoExpand": { title: messages.toolInputAutoExpand }, "/toolInputAutoCollapse": { title: messages.toolInputAutoCollapse },
  } },
});
