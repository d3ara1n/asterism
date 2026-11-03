import { z } from "zod";

export const lineAnchorSchema = z.strictObject({
  line: z.number().int().positive().describe("1-based line number copied from an anchored read, grep, edit, or replace result."),
  hash: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{4}$/).describe("The exact four-character content hash after # in an anchored read, grep, edit, or replace result."),
}).describe("A LINE#HASH reference to the current content at one line.");
const body = z.array(z.string().regex(/^[^\r\n]*$/).describe("One content line without a line terminator; an empty string represents a blank line."))
  .min(1).describe("New text lines to insert or use as replacement content.");
const anchor = lineAnchorSchema.describe("The first affected line, or the preserved line next to an insertion.");
const end = lineAnchorSchema.optional().describe("Inclusive last line for replace/delete. Required for a multi-line range; omission selects only the anchor line. Validation checks the cited endpoints.");
export const editOperationSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("replace").describe("Replace the selected lines with body."), anchor, end, body }),
  z.strictObject({ op: z.literal("delete").describe("Delete the selected lines."), anchor, end }),
  z.strictObject({ op: z.literal("insert_after").describe("Insert body after the preserved anchor line. body contains only new lines."), anchor, body }),
  z.strictObject({ op: z.literal("insert_before").describe("Insert body before the preserved anchor line. body contains only new lines."), anchor, body }),
  z.strictObject({ op: z.literal("append").describe("Append body to the target's text."), body }),
  z.strictObject({ op: z.literal("prepend").describe("Prepend body to the target's text."), body }),
]).describe("Replace/delete an inclusive anchored range, insert beside a preserved anchor, or append/prepend without anchors.");

export const textRowSchema = z.strictObject({
  line: z.number().int().positive().describe("The absolute 1-based line number in the complete text."),
  content: z.string().describe("The line content without its terminator; for an excerpt, only the excerpt window."),
  hash: z.string().nullable().describe("LINE#HASH content hash of the complete line, also for an excerpt; null when the selected view has no edit anchors."),
  excerpt: z.strictObject({
    start: z.number().int().nonnegative().describe("UTF-16 offset of content within the complete line."),
    length: z.number().int().positive().describe("UTF-16 length of the complete line."),
  }).nullable().describe("Present when the line is too long to return in full; content is then a window of the complete line. Null for a complete line."),
});
export type TextRow = z.infer<typeof textRowSchema>;
export const textReadSchema = z.strictObject({
  totalLines: z.number().int().nonnegative().describe("Number of logical lines in the complete text; empty text has zero lines."),
  fromLine: z.number().int().positive().describe("First requested line, counted from 1 in the complete text."),
  rows: z.array(textRowSchema).describe("Selected lines and their available edit anchors; long lines are returned as excerpts."),
  noFinalNewline: z.boolean().describe("Whether non-empty text lacks a final newline."),
  nextOffset: z.number().int().positive().nullable().describe("First unread line after the returned range, or null at end of text. Use as target.offset only when this implementation supports line selection."),
}).describe("Selected text lines with available edit anchors, final-newline information and a continuation position.");

export const textChangeSchema = z.strictObject({
  changed: z.boolean().describe("Whether the target was created or its content changed."),
  diff: z.string().describe("The actual unified diff, preserving final-newline and CRLF differences."),
  added: z.number().int().nonnegative().describe("Number of added lines in the actual diff."),
  removed: z.number().int().nonnegative().describe("Number of removed lines in the actual diff."),
  anchors: z.array(textRowSchema).describe("Fresh anchors for lines produced by edit or replace, including a line shifted into a deletion gap. Always empty for write."),
  anchorsTruncated: z.boolean().describe("True when the fresh anchors cover a subset of the changed lines."),
}).describe("The committed content change with an actual diff and bounded fresh edit anchors. write returns an empty anchors array.");
export type TextRead = z.infer<typeof textReadSchema>;
export type TextChange = z.infer<typeof textChangeSchema>;

export const textReplaceSchema = textChangeSchema.extend({
  matches: z.number().int().nonnegative().describe("Number of matched occurrences, including matches whose replacement leaves content unchanged."),
}).describe("Match count, actual content diff, and bounded fresh anchors for the resulting changed lines.");
export type TextReplace = z.infer<typeof textReplaceSchema>;
