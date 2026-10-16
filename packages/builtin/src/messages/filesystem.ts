import { defineMessages, pluginNamespace } from "@atelier/sdk/contracts";

export const filesystemMessages = pluginNamespace("atelier.builtin").messages("en", defineMessages({
  directoryBrowseFailed: {
    id: "directoryBrowseFailed",
    defaultMessage: "The directory picker could not be opened. Try again or enter a path.",
  },
  absolutePath: {
    id: "absolutePath",
    defaultMessage: "Absolute path",
  },
  toolDirectoryList: {
    id: "toolDirectoryList",
    defaultMessage: "List directory",
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
