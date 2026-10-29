import { z } from "zod";
import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { paradigmConfigurationSchema } from "../configuration/contract.ts";
import { defaultParadigmConfiguration } from "../configuration/state.ts";

export const settingsMessages = builtin.messages("en", defineMessages({
  streaming: { id: "settings.streaming", defaultMessage: "Streaming previews" },
  streamingSummary: { id: "settings.streamingSummary", defaultMessage: "Control how streaming tool content expands and collapses." },
  reset: { id: "settings.reset", defaultMessage: "Restore defaults" },
  loading: { id: "settings.loading", defaultMessage: "Loading settings…" },
  invalid: { id: "settings.invalid", defaultMessage: "Saved settings could not be read. Default values are shown." },
  saveFailed: { id: "settings.saveFailed", defaultMessage: "Settings could not be saved. Try again." },
  retry: { id: "settings.retry", defaultMessage: "Try again" },
  missing: { id: "settings.missing", defaultMessage: "This configuration no longer exists. Reload settings." },
  idTaken: { id: "settings.idTaken", defaultMessage: "This ID is already used. Choose another." },
  builtinRole: { id: "settings.builtinRole", defaultMessage: "Built-in model roles cannot be deleted." },
  builtinId: { id: "settings.builtinId", defaultMessage: "Built-in configuration IDs cannot be changed." },
  autoExpand: { id: "settings.autoExpand", defaultMessage: "Automatically expand streaming content" },
  autoCollapse: { id: "settings.autoCollapse", defaultMessage: "Automatically collapse when streaming finishes" },
}));

/** Managed configuration for the built-in plugin; page layout is independent of the storage contract. */
export const BuiltinSettings = builtin.config(z.object({
  autoExpand: z.boolean().default(true), autoCollapse: z.boolean().default(true),
  paradigm: paradigmConfigurationSchema.default(defaultParadigmConfiguration),
}), { autoExpand: true, autoCollapse: true, paradigm: defaultParadigmConfiguration });
