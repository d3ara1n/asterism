import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const historyMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  searching: { id: "history.searching", defaultMessage: "Searching history…" },
  readFailed: { id: "history.readFailed", defaultMessage: "History could not be loaded." },
  eventRenamed: { id: "history.events.renamed", defaultMessage: "Renamed resource: {title}" },
  history: {
    id: "history.title",
    defaultMessage: "History",
  },
  historyLoadingBody: {
    id: "history.loadingBody",
    defaultMessage: "Reading saved history.",
  },
  searchHistory: {
    id: "history.search",
    defaultMessage: "Find text, tools or resources",
  },
  historyView: {
    id: "history.view.label",
    defaultMessage: "History view",
  },
  historyAllRecords: {
    id: "history.view.allRecords",
    defaultMessage: "All records",
  },
  historySessionEvents: {
    id: "history.view.sessionEvents",
    defaultMessage: "Session events",
  },
  historyAllResourceEvents: {
    id: "history.view.allResourceEvents",
    defaultMessage: "All resource events",
  },
  historySources: {
    id: "history.sources.label",
    defaultMessage: "Event sources",
  },
  searchHistoryViews: {
    id: "history.sources.search",
    defaultMessage: "Find a view or resource",
  },
  sessionEvents: {
    id: "history.sources.session",
    defaultMessage: "Session",
  },
  historyBranches: {
    id: "history.branches.label",
    defaultMessage: "History branches",
  },
  historyMainBranch: {
    id: "history.branches.main",
    defaultMessage: "Main",
  },
  historyBranch: {
    id: "history.branches.numbered",
    defaultMessage: "Branch {number}",
  },
  historyExecutionBranch: {
    id: "history.branches.execution",
    defaultMessage: "Current execution branch",
  },
  historyExecutionPosition: {
    id: "history.executionPosition",
    defaultMessage: "Execution position",
  },
  historyBranchOrigin: {
    id: "history.branches.origin",
    defaultMessage: "Return to the fork point in {branch}",
  },
  historyBranchJump: {
    id: "history.branches.jump",
    defaultMessage: "Find {branch} at this fork point",
  },
  historyBranchChildren: {
    id: "history.branches.children",
    defaultMessage: "{count, plural, one {# branch from here} other {# branches from here}}",
  },
  historyBefore: {
    id: "history.selection.before",
    defaultMessage: "Select before this entry",
  },
  historyAfter: {
    id: "history.selection.after",
    defaultMessage: "Select this entry",
  },
  historyStart: {
    id: "history.selection.start",
    defaultMessage: "Session start",
  },
  historyFiltered: {
    id: "history.selection.filtered",
    defaultMessage: "The selected entry is hidden by filters.",
  },
  historyEntryActions: {
    id: "history.entry.actions",
    defaultMessage: "History entry actions",
  },
  continueFromHere: {
    id: "history.continue.action",
    defaultMessage: "Continue from here",
  },
  continueTitle: {
    id: "history.continue.title",
    defaultMessage: "Continue from this position?",
  },
  continueDescription: {
    id: "history.continue.description",
    defaultMessage: "All agents will use this session path. Existing descendants are kept. External resource contents are not restored.",
  },
  continueConfirm: {
    id: "history.continue.confirm",
    defaultMessage: "Use this position",
  },
  waitForResources: {
    id: "history.continue.waitForResources",
    defaultMessage: "Wait for {names} to finish before continuing from history.",
  },
  unknownResource: {
    id: "history.unknownResource",
    defaultMessage: "Unknown resource",
  },
  eventCreated: {
    id: "history.events.created",
    defaultMessage: "Created {kind}: {title}",
  },
  eventAdded: {
    id: "history.events.added",
    defaultMessage: "Added to workbench: {title}",
  },
  eventRemoved: {
    id: "history.events.removed",
    defaultMessage: "Removed from workbench: {title}",
  },
  eventLinked: {
    id: "history.events.linked",
    defaultMessage: "Linked {resource} to {receiver}",
  },
  eventDetached: {
    id: "history.events.detached",
    defaultMessage: "Disconnected {resource} from {receiver}",
  },
  unknownRecord: {
    id: "history.unknownRecord",
    defaultMessage: "Unknown record · {id}",
  },
}));
