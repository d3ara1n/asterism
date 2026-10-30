import { defineRendererPlugin, type RendererModule } from "@asterism-app/sdk/renderer";
import { builtinSettingsPages } from "./settings/SettingsPage";
import { agentFeedbackRenderer } from "./agent/feedback-renderer";
import { ConversationEntry, prepareHomeEntry } from "./home/Entry";
import { homeMessages } from "./messages/home";

import agent from "./agent/renderer";
import filesystem from "./filesystem/renderer";
import manual from "./manual/renderer";
import mcp from "./mcp/renderer";
import mesh from "./mesh/renderer";
import naming from "./naming/renderer";
import notes from "./notes/renderer";
import questions from "./questions/renderer";
import resources from "./resources/renderer";
import shell from "./shell/renderer";
import skills from "./skills/renderer";
import terminal from "./terminal/renderer";
import usage from "./usage/renderer";
import web from "./web/renderer";
import subagents from "./subagents/renderer";

const builtinViews: readonly RendererModule[] = [agent, filesystem, manual, mcp, mesh, naming, notes, questions, resources, shell, skills, terminal, usage, web, subagents];
export default defineRendererPlugin({
  modules: [...builtinViews, agentFeedbackRenderer], settings: builtinSettingsPages, prepare: prepareHomeEntry,
  sessionEntries: [{ id: "conversation", title: homeMessages.entryTitle, Body: ConversationEntry }],
});

export { createMessageDraft, type MessageDraft } from "./agent/conversation/draft";
export { AttachFiles, DraftFiles, DraftFileError, fileInputEvents } from "./agent/conversation/Files";
export { ModelChoices } from "./agent/conversation/ModelChoices";
export { SubmissionIdentity } from "./agent/conversation/submission";
