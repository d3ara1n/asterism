import { z } from "zod";
import { defineData } from "../../shared/presentation.ts";
import { defineImplementation, defineResource } from "../../shared/module-contract.ts";
import { List, Read } from "../../tools/declarations.ts";

export const Directory = defineResource("directory", z.object({ path: z.string() }));
export const DirectoryView = defineData("weft.directory.card", 1, z.strictObject({ path: z.string() }));
export const DirectoryRead = defineImplementation({
  ...defineData("weft.directory.read", 1, z.strictObject({ path: z.string(), text: z.string() })),
  resource: Directory, tool: Read, targetSchema: z.strictObject({ path: z.string().min(1).max(4096) }),
  description: "Read a UTF-8 text file (up to 256 KB). target.path is relative to the directory root.",
  effect: "read", execution: "parallel",
});
export const DirectoryList = defineImplementation({
  ...defineData("weft.directory.list", 1, z.strictObject({
    path: z.string(),
    entries: z.array(z.strictObject({ name: z.string(), type: z.enum(["directory", "file", "other"]) })),
    truncated: z.boolean(),
  })),
  resource: Directory, tool: List,
  targetSchema: z.union([z.null(), z.strictObject({ path: z.string().min(1).max(4096) })]),
  description: "List directory entries. Omit target for the resource root, or set target.path to a relative subdirectory.",
  effect: "read", execution: "parallel",
});
