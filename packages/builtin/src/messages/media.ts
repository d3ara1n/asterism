import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const mediaMessages = builtin.messages("en", defineMessages({
  save: { id: "media.file.save", defaultMessage: "Save file" },
  saveAs: { id: "media.file.saveAs", defaultMessage: "Save as…" },
  saved: { id: "media.file.saved", defaultMessage: "Saved {name}" },
  preview: { id: "media.image.preview", defaultMessage: "Preview image" },
  saveFailed: { id: "media.file.saveFailed", defaultMessage: "The file could not be saved." },
  attach: { id: "media.attachments.add", defaultMessage: "Attach files" },
  remove: { id: "media.attachments.remove", defaultMessage: "Remove file" },
  uploading: { id: "media.attachments.uploading", defaultMessage: "Adding files…" },
  cancel: { id: "media.attachments.cancelUpload", defaultMessage: "Cancel upload" },
  pdfPreview: { id: "media.pdf.preview", defaultMessage: "Preview PDF" },
  pdfPreviousPage: { id: "media.pdf.previousPage", defaultMessage: "Previous page" },
  pdfNextPage: { id: "media.pdf.nextPage", defaultMessage: "Next page" },
  pdfPages: { id: "media.pdf.pages", defaultMessage: "{page, number} / {pages, number}" },
  pdfZoomIn: { id: "media.pdf.zoomIn", defaultMessage: "Zoom in" },
  pdfZoomOut: { id: "media.pdf.zoomOut", defaultMessage: "Zoom out" },
  pdfFitWidth: { id: "media.pdf.fitWidth", defaultMessage: "Fit to width" },
  pdfPasswordRequired: { id: "media.pdf.passwordRequired", defaultMessage: "Password-protected PDF" },
  unavailable: { id: "media.preview.unavailable", defaultMessage: "Preview unavailable" },
  failed: { id: "media.attachments.addFailed", defaultMessage: "The file could not be added. Try again." },
}));
