import { implementCall, PluginApiError } from "@asterism-app/sdk/runtime";
import { open, readFile } from "node:fs/promises";
import type { z } from "zod";
import { Directory } from "./contract.ts";
import { ReadDirectoryFile, ReadDirectoryGitBase, SaveDirectoryText } from "./editor-contract.ts";
import { withinDirectory } from "./paths.ts";
import { readTextFile, commitTextFile } from "./text-io.ts";
import { TextError } from "../shared/text.ts";
import { filesystemFailure } from "./errors.ts";
import { editorMessages } from "../messages/editor.ts";
import { imageMediaType } from "./image-io.ts";
import { readGitBase } from "./git-base.ts";

function editorFailure(error: unknown): never {
  if (error instanceof TextError && (error.code === "unsupported_text" || error.code === "file_too_large")) {
    throw new PluginApiError("invalid_argument", error.message, error.code,
      error.code === "unsupported_text" ? editorMessages.unsupported : editorMessages.tooLarge);
  }
  const failure = filesystemFailure(error, "Access editor file");
  throw new PluginApiError("unavailable", failure.error.message, failure.error.code);
}

export const editorCalls = [
  implementCall(ReadDirectoryFile, async ({ path }, { object, signal }): Promise<z.infer<typeof ReadDirectoryFile.output>> => {
    const snapshot = object.snapshot();
    if (!snapshot) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
    try {
      const selected = await withinDirectory(Directory.stateSchema.parse(snapshot.data).path, path);
      signal.throwIfAborted();
      const file = await open(selected, "r");
      let mediaType: string | null;
      try {
        const header = Buffer.alloc(16);
        await file.read(header, 0, header.length, 0);
        mediaType = imageMediaType(header);
      } finally { await file.close(); }
      if (mediaType) return { kind: "image" as const, mediaType, base64: (await readFile(selected, { signal })).toString("base64") };
      return { kind: "text" as const, text: (await readTextFile(selected, signal)).text };
    } catch (error) { signal.throwIfAborted(); return editorFailure(error); }
  }),
  implementCall(ReadDirectoryGitBase, async ({ path }, { object, signal }) => {
    const snapshot = object.snapshot();
    if (!snapshot) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
    const selected = await withinDirectory(Directory.stateSchema.parse(snapshot.data).path, path);
    return { text: await readGitBase(selected, signal) };
  }),
  implementCall(SaveDirectoryText, async ({ path, text }, { object, signal }) => {
    const snapshot = object.snapshot();
    if (!snapshot) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
    try {
      const selected = await withinDirectory(Directory.stateSchema.parse(snapshot.data).path, path);
      const before = await readTextFile(selected, signal);
      await commitTextFile(selected, before, text, signal);
      return null;
    } catch (error) { signal.throwIfAborted(); return editorFailure(error); }
  }),
];
