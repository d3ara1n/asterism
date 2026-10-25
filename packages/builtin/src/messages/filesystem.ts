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
  toolSearchFiles: {
    id: "toolSearchFiles",
    defaultMessage: "{count, plural, one {#{truncated, select, true {+} other {}} file} other {#{truncated, select, true {+} other {}} files}}",
  },
  toolSearchMatches: {
    id: "toolSearchMatches",
    defaultMessage: "{count, plural, one {#{truncated, select, true {+} other {}} match} other {#{truncated, select, true {+} other {}} matches}}",
  },
  toolSearchFilesOmitted: {
    id: "toolSearchFilesOmitted",
    defaultMessage: "{count, plural, one {# more file is not shown.} other {# more files are not shown.}}",
  },
  toolSearchOptionFiles: {
    id: "toolSearchOptionFiles",
    defaultMessage: "Files only",
  },
  toolSearchOptionCount: {
    id: "toolSearchOptionCount",
    defaultMessage: "Count per file",
  },
  toolSearchOptionLiteral: {
    id: "toolSearchOptionLiteral",
    defaultMessage: "Literal",
  },
  toolSearchOptionIgnoreCase: {
    id: "toolSearchOptionIgnoreCase",
    defaultMessage: "Ignore case",
  },
  toolSearchOptionWord: {
    id: "toolSearchOptionWord",
    defaultMessage: "Whole word",
  },
  toolSearchOptionHidden: {
    id: "toolSearchOptionHidden",
    defaultMessage: "Include hidden",
  },
  toolSearchOptionNoIgnore: {
    id: "toolSearchOptionNoIgnore",
    defaultMessage: "Include ignored",
  },
  toolSearchOptionContext: {
    id: "toolSearchOptionContext",
    defaultMessage: "{count, plural, one {# context line} other {# context lines}}",
  },
  toolSearchOptionLimit: {
    id: "toolSearchOptionLimit",
    defaultMessage: "Limit {count}",
  },
  toolSearchLimit: {
    id: "toolSearchLimit",
    defaultMessage: "{unit, select, rows {Search stopped at the matching-line limit.} other {Search stopped at the file limit.}}",
  },
  toolSearchOutputBytes: {
    id: "toolSearchOutputBytes",
    defaultMessage: "Search stopped when the returned results reached the 64 KiB budget.",
  },
  toolSearchRecordBytes: {
    id: "toolSearchRecordBytes",
    defaultMessage: "Search stopped because a process output record exceeded 1 MiB. That record could not be decoded.",
  },
  toolSearchEmptyIncomplete: {
    id: "toolSearchEmptyIncomplete",
    defaultMessage: "No results returned; the search is incomplete.",
  },
  toolSearchNoLines: {
    id: "toolSearchNoLines",
    defaultMessage: "No matching lines.",
  },
  toolSearchFiltered: {
    id: "toolSearchFiltered",
    defaultMessage: "{filters, select, hidden {Hidden entries were skipped. Set hidden to include them.} ignored {Ignore-file rules were applied. Set noIgnore to include ignored entries.} other {Hidden entries and ignore-file rules were skipped. Set hidden or noIgnore to include them.}}",
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
