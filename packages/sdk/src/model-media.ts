/** When the browser supplies no type, infer common MIME types from the extension; mark as binary when still unrecognized. */
const extensionTypes: Readonly<Record<string, string>> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
};
export function fileMediaType(file: { type: string; name: string }): string {
  return file.type || extensionTypes[file.name.split(".").at(-1)?.toLowerCase() ?? ""] || "application/octet-stream";
}
/** A derived classification for UI display, not a model capability. */
export const previewsAsImage = (mediaType: string) => mediaType.startsWith("image/");
/** Client resource limits: per-file size, count, and total size leave room for protocol envelopes and base64. */
export const modelInputLimits = { file: 5 * 1024 * 1024, files: 20, total: 20 * 1024 * 1024 } as const;
