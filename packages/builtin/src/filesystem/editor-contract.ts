import { z } from "zod";
import { defineCall } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const ReadDirectoryFile = defineCall(builtin.name("directory.file.read"), {
  scope: "object",
  input: z.strictObject({ path: z.string().min(1) }),
  output: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("text"), text: z.string() }),
    z.strictObject({ kind: z.literal("image"), mediaType: z.string(), base64: z.string() }),
    z.strictObject({ kind: z.literal("unsupported"), reason: z.enum(["format", "size"]), size: z.number().nonnegative() }),
    z.strictObject({ kind: z.literal("directory") }),
  ]),
});
export const ReadDirectoryGitBase = defineCall(builtin.name("directory.file.git-base"), {
  scope: "object",
  input: z.strictObject({ path: z.string().min(1) }),
  output: z.strictObject({ text: z.string().nullable() }),
});
export const ReadDirectoryDiff = defineCall(builtin.name("directory.file.diff"), {
  scope: "object",
  input: z.strictObject({ path: z.string().min(1) }),
  output: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("patch"), patch: z.string() }),
    z.strictObject({ kind: z.literal("binary") }),
    z.strictObject({ kind: z.literal("empty") }),
  ]),
});
export const SaveDirectoryText = defineCall(builtin.name("directory.editor.save"), {
  scope: "object",
  input: z.strictObject({ path: z.string().min(1), text: z.string() }),
  output: z.null(),
});

/** Resolve a user-selected resource location for a native application or file manager. */
export const ResolveDirectoryLocation = defineCall(builtin.name("directory.location.resolve"), {
  scope: "object",
  input: z.strictObject({ path: z.string() }),
  output: z.strictObject({ path: z.string(), directory: z.boolean() }),
});
