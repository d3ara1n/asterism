import type { UiMessage } from "@asterism-app/sdk/contracts";
import type { TelemetryDimension } from "../../../../shared/telemetry";
import { dashboardMessages as msg } from "../../../messages/dashboard";

export const dimensionLabels: Record<TelemetryDimension, UiMessage> = {
  modelKind: msg.dimensionModelKind, model: msg.dimensionModel, provider: msg.dimensionProvider, folder: msg.dimensionFolder, session: msg.dimensionSession,
  purpose: msg.dimensionPurpose, plugin: msg.dimensionPlugin, thinking: msg.dimensionThinking, error: msg.errors,
};
/** Dimensions offered for attribution; failures belong to the model view. */
export const attributionDimensions = ["folder", "session", "modelKind", "model", "provider", "purpose", "plugin", "thinking"] as const satisfies readonly TelemetryDimension[];
