import { defineRendererPlugin, type RendererModule } from "@atelier/sdk/renderer";
import { BuiltinSettingsPage } from "./settings/SettingsPage";
import { agentFeedbackRenderer } from "./agent/feedback-renderer";

const entries = import.meta.glob<RendererModule>("./*/renderer.tsx", { eager: true, import: "default" });
/** 前端只收集视图入口及纯契约；不导入后台模块。 */
export const builtinViews: readonly RendererModule[] = Object.keys(entries).sort().map(path => entries[path]!);
export const builtinRenderer = defineRendererPlugin({ modules: [...builtinViews, agentFeedbackRenderer], settings: { locations: ["streaming", "shell"], Body: BuiltinSettingsPage } });
export { BuiltinRendererProvider, type BuiltinRendererServices } from "./renderer-context";

export { createMessageDraft, type MessageDraft } from "./agent/conversation/draft";
export { AttachFiles, DraftFiles, DraftFileError, fileInputEvents } from "./agent/conversation/Files";
export { ModelChoices } from "./agent/conversation/ModelChoices";
export { SubmissionIdentity } from "./agent/conversation/submission";
