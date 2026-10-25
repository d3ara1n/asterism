import { z } from "zod";
import { defineImplementation, defineCreation, defineCall, contentRefSchema } from "@atelier/sdk/contracts";
import { builtin, List, Read, Edit, Write, See, textReadSchema, textChangeSchema } from "@atelier/builtin-api/contracts";

export const Directory = builtin.resource("directory", z.object({ path: z.string() }));
export const CreateDirectory = defineCreation(Directory, { id: builtin.name("directory.create"),
  schema: z.strictObject({ path: z.string().min(1).max(4096), title: z.string().trim().min(1).max(160).optional() }),
});
export const DirectoryView = builtin.data("directory.card", z.strictObject({ path: z.string() }));
export const DirectoryList = defineImplementation({
  ...builtin.data("directory.list", z.strictObject({
    path: z.string().describe("The listed directory path relative to the resource root; '.' denotes the root."),
    entries: z.array(z.strictObject({
      name: z.string().describe("Entry name within the listed directory."),
      type: z.enum(["directory", "file", "other"]).describe("The entry type; symbolic links and other special entries are reported as other."),
    })).describe("Up to 500 direct entries."),
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
  ...builtin.data("directory.read", textReadSchema.extend({ path: filePath })
    .describe("Complete selected file lines with absolute line numbers, optional hashes, final-newline state and the next unread line.")),
  resource: Directory, tool: Read,
  targetSchema: z.strictObject({
    path: filePath,
    offset: z.number().int().positive().optional().describe("First line to read, 1-based in the complete file; defaults to 1."),
    limit: z.number().int().positive().max(2000).optional().describe("Maximum lines to read; defaults to 1000, maximum 2000. The output is also limited to 64 KiB of line text; lines longer than 16000 characters are returned as excerpts with anchors for the complete line."),
  }).describe("Select file content and its line range, e.g. {\"path\":\"src/main.ts\",\"offset\":100,\"limit\":80}. Content is UTF-8 text; nextOffset marks the start of remaining lines."),
  effect: "read", execution: "parallel",
});
export const DirectoryEdit = defineImplementation({
  ...builtin.data("directory.edit", textChangeSchema.extend({ path: filePath })
    .describe("The actual committed file diff and fresh edit anchors. The full resulting file is limited to 8 MiB.")),
  resource: Directory, tool: Edit, targetSchema: fileTarget, effect: "write", execution: "sequential",
});
export const DirectoryWrite = defineImplementation({
  ...builtin.data("directory.write", textChangeSchema.extend({
    path: filePath,
    created: z.boolean().describe("True when this call created the target file; false when it already existed."),
  }).describe("The written file's actual diff and creation status, with an empty anchors array. Full content is limited to 8 MiB.")),
  resource: Directory, tool: Write, targetSchema: fileTarget, effect: "write", execution: "sequential",
});
export const DirectorySee = defineImplementation({
  ...builtin.data("directory.see", z.strictObject({
    path: filePath, mediaType: z.string().describe("The image MIME type detected from the file signature."),
    size: z.number().int().nonnegative().describe("Image size in bytes."),
    image: contentRefSchema.describe("Immutable content captured when the image was viewed."),
  }).describe("The viewed image, attached to the result for the model.")),
  resource: Directory, tool: See,
  targetSchema: z.strictObject({ path: filePath }).describe("Select one image with {\"path\":\"relative/image.png\"}. Supported formats are PNG, JPEG, GIF and WebP; images are limited to 5 MiB."),
  effect: "read", execution: "parallel",
});

export const DirectoryTree = defineCall(builtin.name("directory.tree"), {
  scope: "object",
  input: z.strictObject({}),
  output: z.strictObject({
    paths: z.array(z.string()),
    gitStatus: z.array(z.strictObject({ path: z.string(), status: z.string() })),
    hasGit: z.boolean(),
  }),
});
