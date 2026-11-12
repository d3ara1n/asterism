import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const modelMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  list: { id: "models.list", defaultMessage: "List models" },
  get: { id: "models.get", defaultMessage: "Read model" },
  providerCount: { id: "models.providerCount", defaultMessage: "{count, plural, one {# provider} other {# providers}}" },
  empty: { id: "models.empty", defaultMessage: "No enabled models" },
  thinkingLevels: { id: "models.thinkingLevels", defaultMessage: "Thinking levels" },
  capacity: { id: "models.capacity", defaultMessage: "Capacity" },
  outputLimit: { id: "models.outputLimit", defaultMessage: "Output limit" },
  prices: { id: "models.prices", defaultMessage: "Reference prices · USD" },
  priceTier: { id: "models.priceTier", defaultMessage: "Price tier" },
  tierFrom: { id: "models.tierFrom", defaultMessage: "≥ {count} toks" },
  noPrices: { id: "models.noPrices", defaultMessage: "No prices configured" },
  text: { id: "models.text", defaultMessage: "Text" },
  image: { id: "models.image", defaultMessage: "Image" },
  audio: { id: "models.audio", defaultMessage: "Audio" },
  video: { id: "models.video", defaultMessage: "Video" },
}));
