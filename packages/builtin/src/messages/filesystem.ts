import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";

export const filesystemMessages = pluginNamespace("asterism.builtin").messages("en", defineMessages({
  directoryRefresh: {
    id: "filesystem.refresh",
    defaultMessage: "Refresh",
  },
  directorySearch: {
    id: "filesystem.filter",
    defaultMessage: "Filter files",
  },
  directoryNoMatches: {
    id: "filesystem.noMatches",
    defaultMessage: "No matching files.",
  },
  directoryReadFailed: {
    id: "filesystem.readFailed",
    defaultMessage: "The directory could not be read.",
  },
  directoryStatusFailed: {
    id: "filesystem.gitStatusFailed",
    defaultMessage: "Git status could not be read.",
  },
  directoryChanges: {
    id: "filesystem.lineChanges",
    defaultMessage: "{added, plural, one {# line added} other {# lines added}}, {removed, plural, one {# line removed} other {# lines removed}}",
  },
  directoryBrowseFailed: {
    id: "filesystem.creation.browseFailed",
    defaultMessage: "The directory picker could not be opened. Try again or enter a path.",
  },
  absolutePath: {
    id: "filesystem.absolutePath",
    defaultMessage: "Absolute path",
  },
  directoryTitlePlaceholder: {
    id: "filesystem.creation.titlePlaceholder",
    defaultMessage: "Leave empty to use the folder name",
  },
  toolDirectoryList: {
    id: "tools.filesystem.list",
    defaultMessage: "List directory",
  },
  toolDirectoryMetadata: {
    id: "tools.filesystem.metadata",
    defaultMessage: "Read metadata",
  },
  toolDirectoryFind: {
    id: "tools.filesystem.find",
    defaultMessage: "Find files",
  },
  toolDirectoryGrep: {
    id: "tools.filesystem.grep",
    defaultMessage: "Search text",
  },
  toolSearchFiles: {
    id: "tools.filesystem.search.fileCount",
    defaultMessage: "{count, plural, one {#{truncated, select, true {+} other {}} file} other {#{truncated, select, true {+} other {}} files}}",
  },
  toolSearchMatches: {
    id: "tools.filesystem.search.matchCount",
    defaultMessage: "{count, plural, one {#{truncated, select, true {+} other {}} match} other {#{truncated, select, true {+} other {}} matches}}",
  },
  toolSearchFilesOmitted: {
    id: "tools.filesystem.search.filesOmitted",
    defaultMessage: "{count, plural, one {# more file is not shown.} other {# more files are not shown.}}",
  },
  toolSearchOptionFiles: {
    id: "tools.filesystem.search.options.filesOnly",
    defaultMessage: "Files only",
  },
  toolSearchOptionCount: {
    id: "tools.filesystem.search.options.countPerFile",
    defaultMessage: "Count per file",
  },
  toolSearchOptionLiteral: {
    id: "tools.filesystem.search.options.literal",
    defaultMessage: "Literal",
  },
  toolSearchOptionIgnoreCase: {
    id: "tools.filesystem.search.options.ignoreCase",
    defaultMessage: "Ignore case",
  },
  toolSearchOptionWord: {
    id: "tools.filesystem.search.options.wholeWord",
    defaultMessage: "Whole word",
  },
  toolSearchOptionHidden: {
    id: "tools.filesystem.search.options.includeHidden",
    defaultMessage: "Include hidden",
  },
  toolSearchOptionNoIgnore: {
    id: "tools.filesystem.search.options.includeIgnored",
    defaultMessage: "Include ignored",
  },
  toolSearchOptionContext: {
    id: "tools.filesystem.search.options.contextLines",
    defaultMessage: "{count, plural, one {# context line} other {# context lines}}",
  },
  toolSearchOptionLimit: {
    id: "tools.filesystem.search.options.limit",
    defaultMessage: "Limit {count}",
  },
  toolSearchLimit: {
    id: "tools.filesystem.search.resultLimit",
    defaultMessage: "{unit, select, rows {Search stopped at the matching-line limit.} other {Search stopped at the file limit.}}",
  },
  toolSearchOutputBytes: {
    id: "tools.filesystem.search.outputByteLimit",
    defaultMessage: "Search stopped when the returned results reached the 64 KiB budget.",
  },
  toolSearchRecordBytes: {
    id: "tools.filesystem.search.recordByteLimit",
    defaultMessage: "Search stopped because a process output record exceeded 1 MiB. That record could not be decoded.",
  },
  toolSearchEmptyIncomplete: {
    id: "tools.filesystem.search.emptyIncomplete",
    defaultMessage: "No results returned; the search is incomplete.",
  },
  toolSearchNoLines: {
    id: "tools.filesystem.search.noMatchingLines",
    defaultMessage: "No matching lines.",
  },
  toolSearchFiltered: {
    id: "tools.filesystem.search.filtered",
    defaultMessage: "{filters, select, hidden {Hidden entries were skipped. Set hidden to include them.} ignored {Ignore-file rules were applied. Set noIgnore to include ignored entries.} other {Hidden entries and ignore-file rules were skipped. Set hidden or noIgnore to include them.}}",
  },
  toolDirectorySee: {
    id: "tools.filesystem.see",
    defaultMessage: "View image",
  },
  toolEntryCount: {
    id: "tools.filesystem.list.entryCount",
    defaultMessage: "{count, plural, one {#{truncated, select, true {+} other {}} entry} other {#{truncated, select, true {+} other {}} entries}}",
  },
  toolDirectoryEmpty: {
    id: "tools.filesystem.list.empty",
    defaultMessage: "This directory is empty.",
  },
  toolDirectoryTruncated: {
    id: "tools.filesystem.list.truncated",
    defaultMessage: "Showing the first 500 entries.",
  },
  browse: {
    id: "filesystem.creation.browse",
    defaultMessage: "Browse…",
  },
  directory: {
    id: "filesystem.directory.kind",
    defaultMessage: "Directory",
  },
  directoryLabel: {
    id: "filesystem.directory.creationLabel",
    defaultMessage: "Directory",
  },
}));
