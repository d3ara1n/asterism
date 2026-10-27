import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const conversationMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  executionProcess: { id: "agent_conversation_executionProcess", defaultMessage: "Execution process" },
  compressing: { id: "agent_conversation_compressing", defaultMessage: "Compacting context…" },
  compressedHistory: { id: "agent_conversation_compressedHistory", defaultMessage: "Earlier conversation compacted" },
  compressionFailed: { id: "agent_conversation_compressionFailed", defaultMessage: "Context compaction failed" },
  compressionCancelled: { id: "agent_conversation_compressionCancelled", defaultMessage: "Context compaction cancelled" },
  processToolCount: { id: "agent_conversation_processToolCount", defaultMessage: "{count, plural, one {# tool call} other {# tool calls}}" },
  drafts: { id: "agent_drafts_title", defaultMessage: "Drafts" },
  draftMoreActions: { id: "agent_drafts_moreActions", defaultMessage: "More actions" },
  saveDraft: { id: "agent_drafts_save", defaultMessage: "Save draft" },
  draftMode: { id: "agent_drafts_mode", defaultMessage: "Send timing" },
  draftNone: { id: "agent_drafts_none", defaultMessage: "Keep" },
  draftNoneHint: { id: "agent_drafts_noneHint", defaultMessage: "Stays here until you take it out." },
  draftSteer: { id: "agent_drafts_steer", defaultMessage: "This turn" },
  draftSteerHint: { id: "agent_drafts_steerHint", defaultMessage: "Joins the next model request while the agent keeps working." },
  draftFollow: { id: "agent_drafts_follow", defaultMessage: "Next turn" },
  draftFollowHint: { id: "agent_drafts_followHint", defaultMessage: "Goes out when this run finishes, starting the next turn." },
  draftSteerIdleNote: { id: "agent_drafts_steerIdleNote", defaultMessage: "Takes effect while the agent is running." },
  draftSummaryFollow: { id: "agent_drafts_summaryFollow", defaultMessage: "{count, plural, one {# next turn} other {# next turn}}" },
  draftSummarySteer: { id: "agent_drafts_summarySteer", defaultMessage: "{count, plural, one {# this turn} other {# this turn}}" },
  draftSummaryNone: { id: "agent_drafts_summaryNone", defaultMessage: "{count, plural, one {# held} other {# held}}" },
  takeDraft: { id: "agent_drafts_take", defaultMessage: "Take out" },
  takeDraftHint: { id: "agent_drafts_takeHint", defaultMessage: "Load into editor" },
  exchangeDraft: { id: "agent_drafts_exchange", defaultMessage: "Exchange with editor" },
  exchangeDraftHint: { id: "agent_drafts_exchangeHint", defaultMessage: "Editor content goes back into the drafts box as held." },
  discardDraft: { id: "agent_drafts_discard", defaultMessage: "Discard" },
  discardDraftTitle: { id: "agent_drafts_discardTitle", defaultMessage: "Discard draft?" },
  discardDraftDescription: { id: "agent_drafts_discardDescription", defaultMessage: "This draft will be permanently removed." },
  moveUp: { id: "agent_drafts_moveUp", defaultMessage: "Move earlier" },
  moveDown: { id: "agent_drafts_moveDown", defaultMessage: "Move later" },
  previewDraft: { id: "agent_drafts_preview", defaultMessage: "Preview full draft" },
  draftFilesOnly: { id: "agent_drafts_filesOnly", defaultMessage: "{count, plural, one {# attachment} other {# attachments}}" },
  draftTransferFailed: { id: "agent_drafts_transferFailed", defaultMessage: "The draft could not be transferred. Its contents have been kept." },
  draftUpdateFailed: { id: "agent_drafts_updateFailed", defaultMessage: "The draft could not be updated." },
  modeUpdateFailed: { id: "agent_drafts_modeUpdateFailed", defaultMessage: "The send timing could not be changed." },
  draftExchangePending: { id: "agent_drafts_exchangePending", defaultMessage: "The draft exchange is awaiting confirmation. Retry to finish restoring the editor." },
  retryTake: { id: "agent_drafts_retryTake", defaultMessage: "Retry" },
  minimap: {
    id: "agent_conversation_minimap",
    defaultMessage: "Conversation navigation",
  },
  minimapMessage: {
    id: "agent_conversation_minimapMessage",
    defaultMessage: "Go to message {number}",
  },
  contextSummary: {
    id: "agent_conversation_contextSummary",
    defaultMessage: "Context compressed",
  },
  messagePlaceholder: {
    id: "agent_conversation_Composer_1",
    defaultMessage: "Message the agent",
  },
  draftPlaceholder: {
    id: "agent_conversation_Composer_2",
    defaultMessage: "Draft your next message…",
  },
  continuePlaceholder: {
    id: "agent_conversation_Composer_3",
    defaultMessage: "Continue the conversation…",
  },
  keyboardHint: {
    id: "agent_conversation_Composer_4",
    defaultMessage: "Enter to send · Shift + Enter for a new line",
  },
  stop: {
    id: "agent_conversation_Composer_5",
    defaultMessage: "Stop",
  },
  continue: {
    id: "agent_conversation_Composer_6",
    defaultMessage: "Continue",
  },
  working: {
    id: "agent_conversation_Conversation_1",
    defaultMessage: "Working",
  },
  ready: {
    id: "agent_conversation_Conversation_2",
    defaultMessage: "Ready",
  },
  workingHint: {
    id: "agent_conversation_Conversation_4",
    defaultMessage: "The agent is working…",
  },
  emptyHint: {
    id: "agent_conversation_Conversation_5",
    defaultMessage: "Send a message to begin.",
  },
  latestOutput: {
    id: "agent_conversation_Conversation_6",
    defaultMessage: "Latest output",
  },
  incomplete: {
    id: "agent_conversation_ConversationTimeline_4",
    defaultMessage: "Incomplete",
  },
  you: {
    id: "agent_conversation_ConversationTimeline_5",
    defaultMessage: "You",
  },
}));
