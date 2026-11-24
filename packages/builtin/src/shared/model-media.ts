import { modelMediaModalities, type ModelMediaModality } from "@asterism-app/sdk/contracts";

/** Bound raw bytes before a whole file becomes an in-memory model part. */
export const MAX_INLINE_FILE_BYTES = 8 * 1024 * 1024;
const attachmentTypes: Record<ModelMediaModality, readonly string[]> = {
  image: ["image/png", "image/jpeg"],
  audio: ["audio/mpeg", "audio/wav"],
  video: ["video/mp4"],
  document: ["application/pdf"],
};

export function modelMediaModality(mime: string, toolResult = false): ModelMediaModality | undefined {
  if (toolResult && (mime === "image/gif" || mime === "image/webp")) return "image";
  return modelMediaModalities.find(modality => attachmentTypes[modality].includes(mime));
}

export function acceptsModelMedia(modalities: readonly ModelMediaModality[], mime: string, toolResult = false): boolean {
  const modality = modelMediaModality(mime, toolResult);
  return modality !== undefined && modalities.includes(modality);
}
