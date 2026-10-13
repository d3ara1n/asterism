import { z } from "zod";
import { defineMessages } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";

const messages = core.messages("en", defineMessages({
  thinkingAutoExpand: { id: "settings.thinkingAutoExpand", defaultMessage: "Expand thinking while it streams" },
  thinkingAutoCollapse: { id: "settings.thinkingAutoCollapse", defaultMessage: "Collapse thinking when it finishes" },
  toolInputAutoExpand: { id: "settings.toolInputAutoExpand", defaultMessage: "Expand tool input while it streams" },
  toolInputAutoCollapse: { id: "settings.toolInputAutoCollapse", defaultMessage: "Collapse tool input when it finishes" },
}));

/** core 插件配置：用户在插件设置页协商；前后台共享同一契约。 */
export const CoreSettings = core.config(z.strictObject({
  thinkingAutoExpand: z.boolean(), thinkingAutoCollapse: z.boolean(),
  toolInputAutoExpand: z.boolean(), toolInputAutoCollapse: z.boolean(),
}), { thinkingAutoExpand: true, thinkingAutoCollapse: true, toolInputAutoExpand: true, toolInputAutoCollapse: true }, {
  presentation: { fields: {
    "/thinkingAutoExpand": { title: messages.thinkingAutoExpand }, "/thinkingAutoCollapse": { title: messages.thinkingAutoCollapse },
    "/toolInputAutoExpand": { title: messages.toolInputAutoExpand }, "/toolInputAutoCollapse": { title: messages.toolInputAutoCollapse },
  } },
});
