import { open, readFile } from "node:fs/promises";
import { PluginApiError } from "@asterism-app/sdk/runtime";
import type { z } from "zod";
import type { ReadDirectoryFile } from "./editor-contract.ts";
import { readTextFile } from "./text-io.ts";
import { imageMediaType } from "./image-io.ts";
import { filesystemFailure } from "./errors.ts";
import { TextError } from "../shared/text.ts";
import { editorMessages } from "../messages/editor.ts";

export function fileFailure(error: unknown): never {
  if (error instanceof TextError && (error.code === "unsupported_text" || error.code === "file_too_large")) {
    throw new PluginApiError("invalid_argument", error.message, error.code,
      error.code === "unsupported_text" ? editorMessages.unsupported : editorMessages.tooLarge);
  }
  const failure = filesystemFailure(error, "Access file");
  throw new PluginApiError("unavailable", failure.error.message, failure.error.code);
}

/** Read a resolved file for a text or image surface. Resource implementations resolve their own paths. */
export async function readViewerFile(path: string, signal: AbortSignal): Promise<z.infer<typeof ReadDirectoryFile.output>> {
  signal.throwIfAborted();
  const file = await open(path, "r");
  let mediaType: string | null;
  try {
    const header = Buffer.alloc(16);
    await file.read(header, 0, header.length, 0);
    mediaType = imageMediaType(header);
  } finally { await file.close(); }
  if (mediaType) return { kind: "image" as const, mediaType, base64: (await readFile(path, { signal })).toString("base64") };
  return { kind: "text" as const, text: (await readTextFile(path, signal)).text };
}
