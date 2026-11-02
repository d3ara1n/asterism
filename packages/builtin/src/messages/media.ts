import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const mediaMessages = builtin.messages("en", defineMessages({
  save: { id: "agent_media_save", defaultMessage: "Save file" },
  saveAs: { id: "agent_media_saveAs", defaultMessage: "Save as…" },
  saved: { id: "agent_media_saved", defaultMessage: "Saved {name}" },
  preview: { id: "agent_media_preview", defaultMessage: "Preview image" },
  saveFailed: { id: "agent_media_saveFailed", defaultMessage: "The file could not be saved." },
  attach: { id: "agent_media_attach", defaultMessage: "Attach files" },
  remove: { id: "agent_media_remove", defaultMessage: "Remove file" },
  uploading: { id: "agent_media_uploading", defaultMessage: "Adding files…" },
  cancel: { id: "agent_media_cancel", defaultMessage: "Cancel upload" },
  unavailable: { id: "agent_media_unavailable", defaultMessage: "Preview unavailable" },
  limit: { id: "agent_media_limit", defaultMessage: "The files exceed the message size or file count limit." },
  failed: { id: "agent_media_failed", defaultMessage: "The file could not be added. Try again." },
}));
