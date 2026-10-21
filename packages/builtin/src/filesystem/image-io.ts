import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { TextError } from "../shared/text.ts";
import { FilesystemError, failed } from "./errors.ts";
import { withinDirectory } from "./paths.ts";
import { modelInputLimits } from "@atelier/sdk/contracts";

/** 按文件头识别图片，不信任扩展名；非图片不作为工具文件返回。 */
export function imageMediaType(bytes: Uint8Array): string | null {
  const at = (offset: number, ...values: number[]) => values.every((value, i) => bytes[offset + i] === value);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}
export async function readImageFile(root: string, rel: string, signal: AbortSignal): Promise<{ bytes: Uint8Array; mediaType: string }> {
  signal.throwIfAborted();
  const path = await withinDirectory(root, rel);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new FilesystemError(failed("not_file", "The target requires a regular image file."));
    if (info.size > modelInputLimits.file) throw new TextError("file_too_large", "The image exceeds the 5 MiB limit. Choose a smaller image.");
    const bytes = new Uint8Array(info.size);
    let read = 0;
    while (read < bytes.length) {
      signal.throwIfAborted();
      const { bytesRead } = await handle.read(bytes, read, bytes.length - read, read);
      if (!bytesRead) break;
      read += bytesRead;
    }
    const mediaType = imageMediaType(bytes);
    if (!mediaType) throw new TextError("unsupported_image", "Supported image formats are PNG, JPEG, GIF, and WebP.");
    return { bytes: bytes.subarray(0, read), mediaType };
  } finally { await handle.close(); }
}
