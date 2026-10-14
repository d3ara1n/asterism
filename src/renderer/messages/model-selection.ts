import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";
import { commonMessages } from "./common";

export const modelSelectionMessages = pluginNamespace("atelier.host").messages("en", defineMessages({
  agentDefault: { id: "modelSelection.agentDefault", defaultMessage: "Agent default" },
  unavailable: { id: "modelSelection.unavailable", defaultMessage: "{value} (unavailable)" },
  thinkingUnsupported: { id: "modelSelection.thinkingUnsupported", defaultMessage: "Thinking not supported" },
}));
export const thinkingLabels = {
  off: commonMessages.thinkingOff, minimal: commonMessages.thinkingMinimal, low: commonMessages.thinkingLow,
  medium: commonMessages.thinkingMedium, high: commonMessages.thinkingHigh, xhigh: commonMessages.thinkingXhigh,
  max: commonMessages.thinkingMax,
};
