import { z } from "zod";
import { defineImplementation } from "@atelier/sdk/contracts";
import { builtin, Find, Grep, textRowSchema } from "@atelier/builtin-api/contracts";
import { Directory } from "./contract.ts";

const path = z.string().describe("File path relative to the directory resource root, with '/' separators.");
const target = z.union([z.null(), z.strictObject({
  path: z.string().min(1).max(4096).describe("Relative directory or file path within the directory resource; '.' selects its root."),
})]).describe("Null selects the resource root. find selects a directory; grep selects a directory or one file. Selected symbolic links resolve inside the resource root; recursive traversal skips symbolic links. Git metadata entries are excluded from search targets.");
const stopReasonSchema = z.enum(["limit", "output_bytes", "record_bytes"]).nullable()
  .describe("Null means the search completed. Otherwise it stopped at the returned-entry limit, the 64 KiB serialized-entry budget, or the 1 MiB process-record limit. Total matching rows or files are unknown after an early stop.");
const common = {
  path: z.string().describe("Selected search path relative to the resource root."),
  stopReason: stopReasonSchema,
};
const rowIdentity = {
  path,
  match: z.boolean().describe("True for a matching line, false for surrounding context."),
};
const searchRowSchema = z.discriminatedUnion("kind", [
  textRowSchema.extend({
    ...rowIdentity,
    kind: z.literal("line").describe("Complete line content with its optional edit anchor."),
  }),
  z.strictObject({
    ...rowIdentity,
    kind: z.literal("omitted").describe("The complete serialized row exceeds 64 KiB. Its path, line number and match status are preserved; the content and edit anchor are omitted."),
    line: z.number().int().positive().describe("Absolute 1-based line number in the file."),
  }),
]);

export const DirectoryFind = defineImplementation({
  ...builtin.data("directory.find", z.strictObject({
    ...common, files: z.array(path).describe("Returned regular-file paths, up to the requested limit and 64 KiB of result data. Order is unspecified; the array length is the returned count."),
  }).describe("A bounded file search result. Hidden and ignore-file filtering follows ripgrep, with explicit globs taking precedence; recursive searches exclude .git entries.")),
  resource: Directory, tool: Find, targetSchema: target, effect: "read", execution: "parallel",
});
export const DirectoryGrep = defineImplementation({
  ...builtin.data("directory.grep", z.strictObject({
    ...common,
    mode: z.enum(["content", "files", "count"]).describe("The requested output format."),
    rows: z.array(searchRowSchema).describe("Returned matching and context rows in content mode, including explicit records for oversized lines. Omitted content is independent of stopReason: the search can complete with omitted content. Order is unspecified; empty in files and count modes."),
    files: z.array(z.strictObject({
      path,
      count: z.number().int().nonnegative().nullable().describe("Number of matching lines in count mode; null in files mode."),
    })).describe("Returned matching files in files or count mode; empty in content mode. Order is unspecified; the array length is the returned count."),
  }).describe("A bounded ripgrep search result. Content uses UTF-8 bytes without transcoding. Binary, hidden and ignore-file filtering follows ripgrep; explicit positive globs override hidden and ignore rules.")),
  resource: Directory, tool: Grep, targetSchema: target, effect: "read", execution: "parallel",
});
export type FindResult = z.infer<typeof DirectoryFind.schema>;
export type GrepResult = z.infer<typeof DirectoryGrep.schema>;
export type SearchStopReason = z.infer<typeof stopReasonSchema>;
