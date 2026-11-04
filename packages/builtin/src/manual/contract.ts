import { z } from "zod";
import { defineCall, defineCreation, defineImplementation } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { DirectoryList, DirectoryRead, directoryReadTargetSchema, treeChildrenInput, treeChildrenOutput } from "../filesystem/contract.ts";
import { DirectoryFind, DirectoryGrep, directoryFindTargetSchema, directoryGrepTargetSchema } from "../filesystem/search-contract.ts";
import { ReadDirectoryFile } from "../filesystem/editor-contract.ts";

export const Manual = builtin.resource("manual", z.strictObject({}));
export const CreateManual = defineCreation(Manual, {
  id: builtin.name("manual.create"), schema: z.strictObject({}).describe("No parameters."),
});
export const ManualView = builtin.data("manual.card", z.strictObject({}));
/** One level of the manual's virtual directory; `path` includes source prefixes, with '.' for the root. */
export const ManualChildren = defineCall(builtin.name("manual.children"), {
  scope: "object", input: treeChildrenInput, output: treeChildrenOutput,
});
export const ReadManualFile = defineCall(builtin.name("manual.file.read"), {
  scope: "object", input: z.strictObject({ path: z.string().min(1) }), output: ReadDirectoryFile.output,
});
const path = z.string().min(1).max(4096)
  .describe("Path in the manual's virtual directory, including its source prefix, for example 'sdk/docs/getting-started.md'. Paths remain within the manual; selected symlinks remain inside their declared source directory.");
const directoryTarget = z.union([z.null(), z.strictObject({ path })])
  .describe("Null or path '.' selects all manual sources. A virtual ancestor selects its descendants; a source path selects its directory or file. Search globs apply within each selected physical directory; result paths include source prefixes.");

export const ManualList = defineImplementation({
  ...DirectoryList, ...builtin.data("manual.list", DirectoryList.schema), resource: Manual,
  targetSchema: directoryTarget,
});
export const ManualRead = defineImplementation({
  ...DirectoryRead, ...builtin.data("manual.read", DirectoryRead.schema.describe("Selected manual file lines with line numbers, final-newline state, and the next unread line. Content has no edit anchors.")), resource: Manual,
  targetSchema: directoryReadTargetSchema.omit({ anchored: true }).extend({ path })
    .describe("Read one UTF-8 file using its source-qualified manual path, for example 'sdk/docs/getting-started.md'. offset and limit select lines. Selected symlinks remain within their declared source directory."),
});
export const ManualFind = defineImplementation({
  ...DirectoryFind, ...builtin.data("manual.find", DirectoryFind.schema), resource: Manual,
  targetSchema: directoryFindTargetSchema.extend({ path }).nullable().describe(directoryTarget.description!),
});
export const ManualGrep = defineImplementation({
  ...DirectoryGrep, ...builtin.data("manual.grep", DirectoryGrep.schema.describe("A bounded search of manual sources. Content rows include source-qualified paths and line numbers without edit anchors; files and count modes describe matching files.")), resource: Manual,
  targetSchema: directoryGrepTargetSchema.omit({ anchored: true }).extend({ path }).nullable().describe(directoryTarget.description!),
});
