import { defineRendererPlugin, type RendererModule } from "@asterism-app/sdk/renderer";
import { BuiltinSettingsPage } from "./settings/SettingsPage";
import { agentFeedbackRenderer } from "./agent/feedback-renderer";

const entries = import.meta.glob<RendererModule>("./*/renderer.tsx", { eager: true, import: "default" });
/** The frontend collects only view entry points and pure contracts; it imports no backend modules. */
export const builtinViews: readonly RendererModule[] = Object.keys(entries).sort().map(path => entries[path]!);
export const builtinRenderer = defineRendererPlugin({ modules: [...builtinViews, agentFeedbackRenderer], settings: { locations: ["streaming", "shell", "mcp", "skills"], Body: BuiltinSettingsPage } });
export { BuiltinRendererProvider, type BuiltinRendererServices } from "./renderer-context";

export { createMessageDraft, type MessageDraft } from "./agent/conversation/draft";
export { AttachFiles, DraftFiles, DraftFileError, fileInputEvents } from "./agent/conversation/Files";
export { ModelChoices } from "./agent/conversation/ModelChoices";
export { SubmissionIdentity } from "./agent/conversation/submission";
