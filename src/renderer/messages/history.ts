import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const historyMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  eventRenamed: { id: "eventRenamed", defaultMessage: "Renamed resource: {title}" },
  history: {
    id: "history",
    defaultMessage: "History",
  },
  historyLoadingBody: {
    id: "historyLoadingBody",
    defaultMessage: "Reading saved history.",
  },
  searchHistory: {
    id: "searchHistory",
    defaultMessage: "Find text, tools or resources",
  },
  historyView: {
    id: "historyView",
    defaultMessage: "History view",
  },
  historyAllRecords: {
    id: "historyAllRecords",
    defaultMessage: "All records",
  },
  historySessionEvents: {
    id: "historySessionEvents",
    defaultMessage: "Session events",
  },
  historyAllResourceEvents: {
    id: "historyAllResourceEvents",
    defaultMessage: "All resource events",
  },
  historySources: {
    id: "historySources",
    defaultMessage: "Event sources",
  },
  searchHistoryViews: {
    id: "searchHistoryViews",
    defaultMessage: "Find a view or resource",
  },
  sessionEvents: {
    id: "sessionEvents",
    defaultMessage: "Session",
  },
  historyBranches: {
    id: "historyBranches",
    defaultMessage: "History branches",
  },
  historyMainBranch: {
    id: "historyMainBranch",
    defaultMessage: "Main",
  },
  historyBranch: {
    id: "historyBranch",
    defaultMessage: "Branch {number}",
  },
  historyExecutionBranch: {
    id: "historyExecutionBranch",
    defaultMessage: "Current execution branch",
  },
  historyExecutionPosition: {
    id: "historyExecutionPosition",
    defaultMessage: "Execution position",
  },
  historyBranchOrigin: {
    id: "historyBranchOrigin",
    defaultMessage: "Return to the fork point in {branch}",
  },
  historyBranchJump: {
    id: "historyBranchJump",
    defaultMessage: "Find {branch} at this fork point",
  },
  historyBranchChildren: {
    id: "historyBranchChildren",
    defaultMessage: "{count, plural, one {# branch from here} other {# branches from here}}",
  },
  historyBefore: {
    id: "historyBefore",
    defaultMessage: "Select before this entry",
  },
  historyAfter: {
    id: "historyAfter",
    defaultMessage: "Select this entry",
  },
  historyStart: {
    id: "historyStart",
    defaultMessage: "Session start",
  },
  historyFiltered: {
    id: "historyFiltered",
    defaultMessage: "The selected entry is hidden by filters.",
  },
  historyEntryActions: {
    id: "historyEntryActions",
    defaultMessage: "History entry actions",
  },
  continueFromHere: {
    id: "continueFromHere",
    defaultMessage: "Continue from here",
  },
  continueTitle: {
    id: "continueTitle",
    defaultMessage: "Continue from this position?",
  },
  continueDescription: {
    id: "continueDescription",
    defaultMessage: "All agents will use this session path. Existing descendants are kept. External resource contents are not restored.",
  },
  continueConfirm: {
    id: "continueConfirm",
    defaultMessage: "Use this position",
  },
  waitForResources: {
    id: "waitForResources",
    defaultMessage: "Wait for {names} to finish before continuing from history.",
  },
  unknownResource: {
    id: "unknownResource",
    defaultMessage: "Unknown resource",
  },
  eventCreated: {
    id: "eventCreated",
    defaultMessage: "Created {kind}: {title}",
  },
  eventAdded: {
    id: "eventAdded",
    defaultMessage: "Added to workbench: {title}",
  },
  eventRemoved: {
    id: "eventRemoved",
    defaultMessage: "Removed from workbench: {title}",
  },
  eventLinked: {
    id: "eventLinked",
    defaultMessage: "Linked {resource} to {receiver}",
  },
  eventDetached: {
    id: "eventDetached",
    defaultMessage: "Disconnected {resource} from {receiver}",
  },
  unknownRecord: {
    id: "unknownRecord",
    defaultMessage: "Unknown record · {id}",
  },
}));
