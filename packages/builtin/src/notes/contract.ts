import { z } from "zod";
import { defineImplementation, defineCreation, defineCall } from "@asterism-app/sdk/contracts";
import { builtin, Read, Edit, Write, Replace, Grep, textReadSchema, textReadTargetSchema, textRowSchema, textChangeSchema, textReplaceSchema } from "@asterism-app/builtin-api/contracts";
import { stopReasonSchema } from "../filesystem/search-contract.ts";

export const MAX_NOTE_LENGTH = 100_000;
export const Note = builtin.resource("note", z.object({}));
export const CreateNote = defineCreation(Note, { id: builtin.name("note.create"),
  schema: z.strictObject({
    title: z.string().trim().min(1).max(160).default("Untitled note").describe("Display title for the new note."),
    content: z.string().max(MAX_NOTE_LENGTH).default("").describe("Initial editable text stored in the note. Defaults to empty."),
  }).describe("Note title and initial text."),
});
export const NoteContent = builtin.data("note.content", z.strictObject({ text: z.string().max(MAX_NOTE_LENGTH) }));
export const NoteView = builtin.data("note.card", z.strictObject({ text: z.string().nullable() }));
export const ReadNoteText = defineCall(builtin.name("note.editor.read"), {
  scope: "object",
  input: z.strictObject({}),
  output: z.strictObject({ title: z.string(), text: z.string() }),
});
export const SaveNoteText = defineCall(builtin.name("note.editor.save"), {
  scope: "object",
  input: NoteContent.schema,
  output: z.null(),
});
const targetSchema = z.null().describe("Pass null to select this note's complete current text. Notes have no internal path. Content is limited to 100,000 UTF-16 code units; edits must keep the final text within that limit.");
export const NoteRead = defineImplementation({
  ...builtin.data("note.read", textReadSchema),
  resource: Note, tool: Read,
  targetSchema: textReadTargetSchema.nullable().describe("Select this note's current text, line range and reading view. Null uses defaults. nextOffset marks the start of remaining lines. Notes have no internal path."),
  effect: "read", execution: "parallel",
});
export const NoteGrep = defineImplementation({
  ...builtin.data("note.grep", z.strictObject({
    rows: z.array(textRowSchema.extend({ match: z.boolean().describe("True for a matching line, false for surrounding context.") })),
    stopReason: stopReasonSchema,
  }).describe("Matching and context lines in the current note, with absolute line numbers and optional edit anchors. Long lines are excerpted near the first match; anchors refer to complete lines.")),
  resource: Note, tool: Grep,
  targetSchema: textReadTargetSchema.pick({ anchored: true }).nullable()
    .describe("Search this note's complete current text. Null includes edit anchors by default. Notes have no internal path or file filters."),
  effect: "read", execution: "parallel",
});
export const NoteEdit = defineImplementation({
  ...builtin.data("note.edit", textChangeSchema),
  resource: Note, tool: Edit, targetSchema, effect: "write", execution: "sequential",
});
export const NoteWrite = defineImplementation({
  ...builtin.data("note.write", textChangeSchema),
  resource: Note, tool: Write, targetSchema, effect: "write", execution: "sequential",
});
export const NoteReplace = defineImplementation({
  ...builtin.data("note.replace", textReplaceSchema),
  resource: Note, tool: Replace, targetSchema, effect: "write", execution: "sequential",
});
