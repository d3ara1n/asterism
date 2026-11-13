import { z } from "zod";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const inspectPathInputSchema = z.strictObject({
  path: z.string().min(1).max(4096).describe("Absolute local path or current-user home shorthand (~ or ~/path); for example ~/Projects."),
  list: z.boolean().default(false).describe("Include up to 500 direct entries when the path is a directory. Defaults to false."),
}).describe('A local path and optional listing, for example {"path":"~/Projects","list":true}.');

export const InspectPathResult = builtin.data("filesystem.inspect-path", z.strictObject({
  path: z.string().describe("Absolute path after home expansion and lexical normalization, usable as the path for Directory creation. Symbolic links are not rewritten to their real paths."),
  exists: z.boolean().describe("Whether the path resolves to an existing entry. False means the path is missing or contains a broken symbolic link; other filesystem failures are returned as errors."),
  type: z.enum(["directory", "file", "other"]).nullable().describe("Resolved entry type, following symbolic links; null when exists is false."),
  size: z.number().int().nonnegative().nullable().describe("Byte size for a regular file; null for other types or a missing path."),
  modifiedAt: z.iso.datetime().nullable().describe("Modification time in UTC, or null for a missing path."),
  entries: z.array(z.strictObject({
    name: z.string().describe("Direct entry name, including hidden entries."),
    type: z.enum(["directory", "file", "other"]).describe("Entry type without following symbolic links; symbolic links are other."),
  })).nullable().describe("Direct entries when list is true and the path is a directory; null otherwise. Entry names follow filesystem order."),
  truncated: z.boolean().describe("True when more than 500 entries exist and only the first 500 are returned; false when no listing was requested."),
}).describe("Current local filesystem metadata and an optional one-level directory listing, independent of resource links."));
