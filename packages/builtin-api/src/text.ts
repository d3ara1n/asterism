import { z } from "zod";

export const lineAnchorSchema = z.strictObject({
  line: z.number().int().positive().describe("1-based line number copied from an anchored read or edit result."),
  hash: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{4}$/).describe("The exact four-character content hash after # in an anchored read or edit result."),
}).describe("A LINE#HASH reference to the current content at one line.");
const body = z.array(z.string().regex(/^[^\r\n]*$/).describe("One content line without a line terminator; an empty string represents a blank line."))
  .min(1).describe("New text lines to insert or use as replacement content.");
const anchor = lineAnchorSchema.describe("The first affected line, or the preserved line next to an insertion.");
const end = lineAnchorSchema.optional().describe("Inclusive last line for replace/delete. Omission selects a single line. Validation checks the cited endpoints.");
export const editOperationSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("replace"), anchor, end, body }),
  z.strictObject({ op: z.literal("delete"), anchor, end }),
  z.strictObject({ op: z.literal("insert_after"), anchor, body }),
  z.strictObject({ op: z.literal("insert_before"), anchor, body }),
  z.strictObject({ op: z.literal("append"), body }),
  z.strictObject({ op: z.literal("prepend"), body }),
]).describe("Replace/delete an inclusive anchored range, insert beside a preserved anchor, or append/prepend without anchors.");

export const textRowSchema = z.strictObject({
  line: z.number().int().positive().describe("The absolute 1-based line number in the complete text."),
  content: z.string().describe("The complete line content, without its terminator."),
  hash: z.string().nullable().describe("LINE#HASH content hash, or null when read was requested with anchored:false."),
});
export const textReadSchema = z.strictObject({
  totalLines: z.number().int().nonnegative().describe("Number of logical lines in the complete text; empty text has zero lines."),
  fromLine: z.number().int().positive().describe("First requested line, counted from 1 in the complete text."),
  rows: z.array(textRowSchema).describe("Selected complete lines and their available edit anchors."),
  noFinalNewline: z.boolean().describe("Whether non-empty text lacks a final newline."),
  nextOffset: z.number().int().positive().nullable().describe("First unread line after the returned range, or null at end of text. Use as target.offset only when this implementation supports line selection."),
}).describe("Selected text lines and edit anchors, final-newline information and a continuation position.");

export const textChangeSchema = z.strictObject({
  changed: z.boolean().describe("Whether the target was created or its content changed."),
  diff: z.string().describe("The actual unified diff, preserving final-newline and CRLF differences."),
  added: z.number().int().nonnegative().describe("Number of added lines in the actual diff."),
  removed: z.number().int().nonnegative().describe("Number of removed lines in the actual diff."),
  anchors: z.array(textRowSchema).describe("Fresh anchors for lines produced by edit, including a line shifted into a deletion gap. Always empty for write."),
  anchorsTruncated: z.boolean().describe("True when the fresh anchors cover a subset of the changed lines."),
}).describe("The committed content change with an actual diff and bounded fresh edit anchors. write returns an empty anchors array.");
export type TextRead = z.infer<typeof textReadSchema>;
export type TextChange = z.infer<typeof textChangeSchema>;
