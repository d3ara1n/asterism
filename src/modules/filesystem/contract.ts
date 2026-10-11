import { z } from "zod";
import { defineImplementation } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";
import { List, Read, Edit, Write } from "../shared/declarations.ts";
import { textReadSchema, textChangeSchema } from "../shared/text-contract.ts";

export const Directory = core.resource("directory", z.object({ path: z.string() }));
export const DirectoryView = core.data("directory.card", 1, z.strictObject({ path: z.string() }));
export const DirectoryList = defineImplementation({
  ...core.data("directory.list", 1, z.strictObject({
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

const filePath = z.string().min(1).max(4096).describe("File path relative to the linked directory root, e.g. 'src/main.ts'. Absolute paths and targets escaping the root through .. or symlinks are rejected.");
const fileTarget = z.strictObject({ path: filePath })
  .describe("Select one UTF-8 text file with {\"path\":\"relative/file.txt\"}. Content operations are limited to 8 MiB. edit requires an existing file; write can create missing parents inside the root.");
export const DirectoryRead = defineImplementation({
  ...core.data("directory.read", 1, textReadSchema.extend({ path: filePath })
    .describe("Complete selected file lines with absolute line numbers, optional hashes, final-newline state and the next unread line.")),
  resource: Directory, tool: Read,
  targetSchema: z.strictObject({
    path: filePath,
    offset: z.number().int().positive().optional().describe("First line to read, 1-based in the complete file; defaults to 1."),
    limit: z.number().int().positive().max(2000).optional().describe("Maximum complete lines to read; defaults to 1000, maximum 2000. The output is also limited to 64 KiB of line text."),
  }).describe("Select file content and its line range, e.g. {\"path\":\"src/main.ts\",\"offset\":100,\"limit\":80}. Use nextOffset to continue. Non-UTF-8 or binary content is unsupported."),
  effect: "read", execution: "parallel",
});
export const DirectoryEdit = defineImplementation({
  ...core.data("directory.edit", 1, textChangeSchema.extend({ path: filePath })
    .describe("The actual committed file diff and fresh edit anchors. The full resulting file is limited to 8 MiB.")),
  resource: Directory, tool: Edit, targetSchema: fileTarget, effect: "write", execution: "sequential",
});
export const DirectoryWrite = defineImplementation({
  ...core.data("directory.write", 1, textChangeSchema.extend({
    path: filePath,
    created: z.boolean().describe("True when this call created the target file; false when it already existed."),
  }).describe("The written file's actual diff and creation status; write never returns edit anchors. Full content is limited to 8 MiB.")),
  resource: Directory, tool: Write, targetSchema: fileTarget, effect: "write", execution: "sequential",
});
