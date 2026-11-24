import type { ModelMediaModality } from "@asterism-app/sdk/contracts";

/** Bound raw bytes before a whole file becomes an in-memory model part. */
export const MAX_INLINE_FILE_BYTES = 8 * 1024 * 1024;
const attachmentTypes: Record<ModelMediaModality, readonly string[]> = {
  image: ["image/png", "image/jpeg"],
  audio: ["audio/mpeg", "audio/wav"],
  video: ["video/mp4"],
  pdf: ["application/pdf"],
};

export function acceptsModelMedia(modalities: readonly ModelMediaModality[], mime: string, toolResult = false): boolean {
  if (toolResult && (mime === "image/gif" || mime === "image/webp")) return modalities.includes("image");
  return modalities.some(modality => attachmentTypes[modality].includes(mime));
}
