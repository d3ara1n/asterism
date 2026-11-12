import { z } from "zod";
import { defineImplementation, defineCreation, defineCall, defineChannel, contentRefSchema, fileRefSchema } from "@asterism-app/sdk/contracts";
import { builtin, List, Metadata, Read, Edit, Write, Save, Replace, See, textReadSchema, textReadTargetSchema, textChangeSchema, textReplaceSchema } from "@asterism-app/builtin-api/contracts";

export const Directory = builtin.resource("directory", z.object({ path: z.string() }));
export const CreateDirectory = defineCreation(Directory, { id: builtin.name("directory.create"),
  schema: z.strictObject({ path: z.string().min(1).max(4096), title: z.string().trim().min(1).max(160).optional() }),
});
export const ReadDirectoryDefaults = defineCall(builtin.name("directory.defaults"), {
  scope: "plugin", input: z.strictObject({}), output: z.strictObject({ path: z.string() }),
});
export const DirectoryView = builtin.data("directory.card", z.strictObject({ path: z.string() }));
export const DirectoryList = defineImplementation({
  ...builtin.data("directory.list", z.strictObject({
    path: z.string().describe("The listed directory path relative to the resource root; '.' denotes the root."),
    entries: z.array(z.strictObject({
      name: z.string().describe("Entry name within the listed directory."),
      type: z.enum(["directory", "file", "other"]).describe("The entry type; symbolic links and other special entries are reported as other."),
      ref: fileRefSchema.optional().describe("FileRef for this regular file. Listing does not read file bytes."),
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

export const DirectoryMetadata = defineImplementation({
  ...builtin.data("directory.metadata", z.strictObject({
    path: z.string().describe("The queried path relative to the resource root; '.' denotes the root."),
    type: z.enum(["file", "directory", "other"]).describe("The resolved target type. Symbolic links report their target's type."),
    size: z.number().int().nonnegative().nullable().describe("Size in bytes for a regular file; null for directories and other entry types."),
    modifiedAt: z.iso.datetime().describe("Last modification time as a UTC ISO 8601 string."),
  }).describe("Filesystem metadata with the same fields and meanings on every platform.")),
  resource: Directory, tool: Metadata,
  targetSchema: z.strictObject({
    path: z.string().min(1).max(4096).describe("File or directory path relative to the resource root; '.' selects the root. Absolute paths and paths resolving outside the root are rejected. Symbolic links are followed within the root; missing targets and broken links return path_not_found."),
  }).describe("Select one filesystem entry with {\"path\":\"relative/path\"}; '.' selects the resource root."),
  effect: "read", execution: "parallel",
});

const filePath = z.string().min(1).max(4096).describe("File path relative to the linked directory root, e.g. 'src/main.ts'. Absolute paths and targets escaping the root through .. or symlinks are rejected.");
const fileTarget = z.strictObject({ path: filePath })
  .describe("Select one UTF-8 text file with {\"path\":\"relative/file.txt\"}. Content operations are limited to 8 MiB. edit and replace require an existing file; write can create missing parents inside the root.");
export const directoryReadTargetSchema = textReadTargetSchema.extend({
  path: filePath,
}).describe('Select file content, its line range, and reading view, e.g. {"path":"src/main.ts","offset":100,"limit":80}. Content is UTF-8 text; nextOffset marks the start of remaining lines.');
export const DirectoryRead = defineImplementation({
  ...builtin.data("directory.read", textReadSchema.extend({ path: filePath })
    .describe("Complete selected file lines with absolute line numbers, optional hashes, final-newline state and the next unread line.")),
  resource: Directory, tool: Read,
  targetSchema: directoryReadTargetSchema,
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
export const DirectorySave = defineImplementation({
  ...builtin.data("directory.save", z.strictObject({ path: filePath, size: z.number().int().nonnegative(), ref: fileRefSchema })
    .describe("The saved path, byte count, and a FileRef provided by this directory.")),
  resource: Directory, tool: Save,
  targetSchema: z.strictObject({ path: filePath }).describe("Destination file. Missing parent directories are created; an existing file is replaced after the source is fully read."),
  effect: "write", execution: "sequential",
});
export const DirectoryReplace = defineImplementation({
  ...builtin.data("directory.replace", textReplaceSchema.extend({ path: filePath })
    .describe("Match count, actual committed file diff, and fresh anchors. The full resulting file is limited to 8 MiB.")),
  resource: Directory, tool: Replace, targetSchema: fileTarget, effect: "write", execution: "sequential",
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

/** Card browsing reads one directory level at a time; `path` is relative to the resource root with '.' for the root. */
export const treeChildrenInput = z.strictObject({ path: z.string().min(1).max(4096) });
export const treeChildrenOutput = z.strictObject({
  entries: z.array(z.strictObject({ name: z.string(), directory: z.boolean() })),
});
export const DirectoryChildren = defineCall(builtin.name("directory.children"), {
  scope: "object", input: treeChildrenInput, output: treeChildrenOutput,
});
export const gitStatusValue = z.enum(["added", "deleted", "modified", "renamed", "untracked"]);
/** Git state within the resource root; null outside a repository. Paths are root-relative, untracked directories end in '/'. */
export const DirectoryStatus = defineCall(builtin.name("directory.status"), {
  scope: "object", input: z.strictObject({}),
  output: z.strictObject({
    files: z.array(z.strictObject({ path: z.string(), status: gitStatusValue })),
    added: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
  }).nullable(),
});

/** View-owned filesystem and Git invalidation; the next read supplies current state. */
export type DirectoryWatchEvent =
  | { type: "ready" }
  | { type: "changed" }
  | { type: "error" };
export const DirectoryWatch = defineChannel<null, DirectoryWatchEvent>(builtin.name("directory.watch"));
