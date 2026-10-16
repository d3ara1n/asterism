/** 浏览器未给出类型时按扩展名补全常见 MIME；仍无法识别时如实标为二进制。 */
const extensionTypes: Readonly<Record<string, string>> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
};
export function fileMediaType(file: { type: string; name: string }): string {
  return file.type || extensionTypes[file.name.split(".").at(-1)?.toLowerCase() ?? ""] || "application/octet-stream";
}
/** 界面展示的派生判断，不构成模型能力。 */
export const previewsAsImage = (mediaType: string) => mediaType.startsWith("image/");
/** 客户端资源上限：单个文件、数量与总量为协议封装和 base64 留出余量。 */
export const modelInputLimits = { file: 5 * 1024 * 1024, files: 20, total: 20 * 1024 * 1024 } as const;
