import { implementCall, PluginApiError } from "@asterism-app/sdk/runtime";
import type { z } from "zod";
import { Directory } from "./contract.ts";
import { ReadDirectoryDiff, ReadDirectoryFile, ReadDirectoryGitBase, SaveDirectoryText } from "./editor-contract.ts";
import { withinDirectory } from "./paths.ts";
import { readTextFile, commitTextFile } from "./text-io.ts";
import { fileFailure, readViewerFile } from "./file-io.ts";
import { readGitBase } from "./git-base.ts";
import { readDirectoryDiff } from "./git-diff.ts";

export const editorCalls = [
  implementCall(ReadDirectoryFile, async ({ path }, { object, signal }): Promise<z.infer<typeof ReadDirectoryFile.output>> => {
    const snapshot = object.snapshot();
    if (!snapshot) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
    try {
      const selected = await withinDirectory(Directory.stateSchema.parse(snapshot.data).path, path);
      return await readViewerFile(selected, signal);
    } catch (error) { signal.throwIfAborted(); return fileFailure(error); }
  }),
  implementCall(ReadDirectoryGitBase, async ({ path }, { object, signal }) => {
    const snapshot = object.snapshot();
    if (!snapshot) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
    const selected = await withinDirectory(Directory.stateSchema.parse(snapshot.data).path, path);
    return { text: await readGitBase(selected, signal) };
  }),
  implementCall(ReadDirectoryDiff, async ({ path }, { object, signal }) => {
    const snapshot = object.snapshot();
    if (!snapshot) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
    try {
      return await readDirectoryDiff(Directory.stateSchema.parse(snapshot.data).path, path, signal);
    } catch (error) { signal.throwIfAborted(); return fileFailure(error); }
  }),
  implementCall(SaveDirectoryText, async ({ path, text }, { object, signal }) => {
    const snapshot = object.snapshot();
    if (!snapshot) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
    try {
      const selected = await withinDirectory(Directory.stateSchema.parse(snapshot.data).path, path);
      const before = await readTextFile(selected, signal);
      await commitTextFile(selected, before, text, signal);
      return null;
    } catch (error) { signal.throwIfAborted(); return fileFailure(error); }
  }),
];
