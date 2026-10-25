import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const filesystemMessages = pluginNamespace("atelier.builtin").messages("en", defineMessages({
  directoryRefresh: {
    id: "directoryRefresh",
    defaultMessage: "Refresh",
  },
  directorySearch: {
    id: "directorySearch",
    defaultMessage: "Filter files",
  },
  directoryNoMatches: {
    id: "directoryNoMatches",
    defaultMessage: "No matching files.",
  },
  directoryBrowseFailed: {
    id: "directoryBrowseFailed",
    defaultMessage: "The directory picker could not be opened. Try again or enter a path.",
  },
  absolutePath: {
    id: "absolutePath",
    defaultMessage: "Absolute path",
  },
  directoryTitlePlaceholder: {
    id: "filesystem_creation_2",
    defaultMessage: "Leave empty to use the folder name",
  },
  toolDirectoryList: {
    id: "toolDirectoryList",
    defaultMessage: "List directory",
  },
  toolDirectoryFind: {
    id: "toolDirectoryFind",
    defaultMessage: "Find files",
  },
  toolDirectoryGrep: {
    id: "toolDirectoryGrep",
    defaultMessage: "Search content",
  },
  toolSearchSummary: {
    id: "toolSearchSummary",
    defaultMessage: "{unit, select, rows {{count, plural, one {# row returned} other {# rows returned}} ({matches} matching)} other {{count, plural, one {# file returned} other {# files returned}}}} · {complete, select, true {search complete} other {search incomplete}}",
  },
  toolSearchLimit: {
    id: "toolSearchLimit",
    defaultMessage: "Search stopped at the result limit.",
  },
  toolSearchOutputBytes: {
    id: "toolSearchOutputBytes",
    defaultMessage: "Search stopped at the 64 KiB output budget.",
  },
  toolSearchRecordBytes: {
    id: "toolSearchRecordBytes",
    defaultMessage: "Search stopped because a process output record exceeded 1 MiB. That record could not be decoded.",
  },
  toolSearchLineOmitted: {
    id: "toolSearchLineOmitted",
    defaultMessage: "{match, select, true {Matching line} other {Context line}}; content omitted because the complete row exceeds the 64 KiB output budget.",
  },
  toolSearchEmptyIncomplete: {
    id: "toolSearchEmptyIncomplete",
    defaultMessage: "No results returned; the search is incomplete.",
  },
  toolSearchNoLines: {
    id: "toolSearchNoLines",
    defaultMessage: "No matching lines.",
  },
  toolDirectorySee: {
    id: "toolDirectorySee",
    defaultMessage: "View image",
  },
  toolEntryCount: {
    id: "toolEntryCount",
    defaultMessage: "{count, plural, one {#{truncated, select, true {+} other {}} entry} other {#{truncated, select, true {+} other {}} entries}}",
  },
  toolDirectoryEmpty: {
    id: "toolDirectoryEmpty",
    defaultMessage: "This directory is empty.",
  },
  toolDirectoryTruncated: {
    id: "toolDirectoryTruncated",
    defaultMessage: "Showing the first 500 entries.",
  },
  browse: {
    id: "filesystem_creation_1",
    defaultMessage: "Browse…",
  },
  directory: {
    id: "filesystem_renderer_1",
    defaultMessage: "Directory",
  },
  directoryLabel: {
    id: "filesystem_renderer_2",
    defaultMessage: "Directory",
  },
}));
