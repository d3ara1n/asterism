import { z } from "zod";
import { defineCreation, defineImplementation } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { DirectoryList, DirectoryRead } from "../filesystem/contract.ts";
import { DirectoryFind, DirectoryGrep } from "../filesystem/search-contract.ts";

export const Manual = builtin.resource("manual", z.strictObject({}));
export const CreateManual = defineCreation(Manual, {
  id: builtin.name("manual.create"), schema: z.strictObject({}).describe("No parameters."),
});
export const ManualView = builtin.data("manual.card", z.strictObject({}));
const path = z.string().min(1).max(4096)
  .describe("Path in the manual's virtual directory, including its source prefix, for example 'sdk/docs/getting-started.md'. Paths remain within the manual; selected symlinks remain inside their declared source directory.");
const directoryTarget = z.union([z.null(), z.strictObject({ path })])
  .describe("Null or path '.' selects all manual sources. A virtual ancestor selects its descendants; a source path selects its directory or file. Search globs apply within each selected physical directory; result paths include source prefixes.");

export const ManualList = defineImplementation({
  ...DirectoryList, ...builtin.data("manual.list", DirectoryList.schema), resource: Manual,
  targetSchema: directoryTarget,
});
export const ManualRead = defineImplementation({
  ...DirectoryRead, ...builtin.data("manual.read", DirectoryRead.schema), resource: Manual,
  targetSchema: DirectoryRead.targetSchema.describe("Read one UTF-8 file using its source-qualified manual path, for example 'sdk/docs/getting-started.md'. offset and limit select lines. Selected symlinks remain within their declared source directory."),
});
export const ManualFind = defineImplementation({
  ...DirectoryFind, ...builtin.data("manual.find", DirectoryFind.schema), resource: Manual,
  targetSchema: directoryTarget,
});
export const ManualGrep = defineImplementation({
  ...DirectoryGrep, ...builtin.data("manual.grep", DirectoryGrep.schema), resource: Manual,
  targetSchema: directoryTarget,
});
