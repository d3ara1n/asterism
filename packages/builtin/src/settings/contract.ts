import { z } from "zod";
import { defineMessages } from "@asterism/sdk/contracts";
import { builtin } from "@asterism/builtin-api/contracts";
import { defaultShellSettings, shellSettingsSchema } from "../shell/contract.ts";
import { defaultMcpSettings, mcpSettingsSchema } from "../mcp/contract.ts";

export const settingsMessages = builtin.messages("en", defineMessages({
  streaming: { id: "settings.streaming", defaultMessage: "Streaming previews" },
  reset: { id: "settings.reset", defaultMessage: "Restore defaults" },
  loading: { id: "settings.loading", defaultMessage: "Loading settings…" },
  invalid: { id: "settings.invalid", defaultMessage: "Saved settings could not be read. Default values are shown." },
  saveFailed: { id: "settings.saveFailed", defaultMessage: "Settings could not be saved. Try again." },
  retry: { id: "settings.retry", defaultMessage: "Try again" },
  autoExpand: { id: "settings.autoExpand", defaultMessage: "Automatically expand streaming content" },
  autoCollapse: { id: "settings.autoCollapse", defaultMessage: "Automatically collapse when streaming finishes" },
}));

/** Managed configuration for the built-in plugin; page layout is independent of the storage contract. */
export const BuiltinSettings = builtin.config(z.object({
  autoExpand: z.boolean().default(true), autoCollapse: z.boolean().default(true),
  shell: shellSettingsSchema.default(defaultShellSettings),
  mcp: mcpSettingsSchema.default(defaultMcpSettings),
}), { autoExpand: true, autoCollapse: true, shell: defaultShellSettings, mcp: defaultMcpSettings });
