import { z } from "zod";
import { defineData } from "../../shared/presentation.ts";
import { defineImplementation, defineResource } from "../../shared/module-contract.ts";
import { List } from "../../tools/declarations.ts";

export const Directory = defineResource("directory", z.object({ path: z.string() }));
export const DirectoryView = defineData("weft.directory.card", 1, z.strictObject({ path: z.string() }));
export const DirectoryList = defineImplementation({
  ...defineData("weft.directory.list", 1, z.strictObject({
    path: z.string().describe("The listed directory path relative to the resource root; '.' denotes the root."),
    entries: z.array(z.strictObject({
      name: z.string().describe("Entry name within the listed directory."),
      type: z.enum(["directory", "file", "other"]).describe("The entry type; symbolic links and other special entries are reported as other."),
    })).describe("Up to 500 direct entries; contents are not read and subdirectories are not traversed."),
    truncated: z.boolean().describe("True when the directory contains more than 500 entries and the listing is incomplete."),
  }).describe("A directory listing with its relative path, entry types and truncation status.")),
  resource: Directory, tool: List,
  targetSchema: z.union([
    z.null().describe("Select the directory resource root."),
    z.strictObject({
      path: z.string().min(1).max(4096).describe("Directory path relative to the resource root, for example 'src'; absolute paths and paths resolving outside the root are rejected."),
    }),
  ]).describe("Pass null for the resource root or an object such as {\"path\":\"subdir\"} for a subdirectory. Symbolic links must resolve inside the resource root."),
  effect: "read", execution: "parallel",
});
