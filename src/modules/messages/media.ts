import { defineMessages } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";

export const mediaMessages = core.messages("en", defineMessages({
  attach: { id: "agent_media_attach", defaultMessage: "Attach files" },
  remove: { id: "agent_media_remove", defaultMessage: "Remove file" },
  uploading: { id: "agent_media_uploading", defaultMessage: "Adding files…" },
  cancel: { id: "agent_media_cancel", defaultMessage: "Cancel upload" },
  unavailable: { id: "agent_media_unavailable", defaultMessage: "Preview unavailable" },
  unsupported: { id: "agent_media_unsupported", defaultMessage: "Choose a JPEG, PNG, GIF, WebP image or a PDF." },
  limit: { id: "agent_media_limit", defaultMessage: "The files exceed the message size or file count limit." },
  failed: { id: "agent_media_failed", defaultMessage: "The file could not be added. Try again." },
}));
