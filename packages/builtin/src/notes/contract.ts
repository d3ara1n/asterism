import { z } from "zod";
import { defineImplementation, defineCreation } from "@asterism/sdk/contracts";
import { builtin, Read, Edit, Write, textReadSchema, textChangeSchema } from "@asterism/builtin-api/contracts";

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
const targetSchema = z.null().describe("Pass null to select this note's complete current text. Notes have no internal path or read range. Content is limited to 100,000 UTF-16 code units; edits must keep the final text within that limit.");
export const NoteRead = defineImplementation({
  ...builtin.data("note.read", textReadSchema),
  resource: Note, tool: Read, targetSchema, effect: "read", execution: "parallel",
});
export const NoteEdit = defineImplementation({
  ...builtin.data("note.edit", textChangeSchema),
  resource: Note, tool: Edit, targetSchema, effect: "write", execution: "sequential",
});
export const NoteWrite = defineImplementation({
  ...builtin.data("note.write", textChangeSchema),
  resource: Note, tool: Write, targetSchema, effect: "write", execution: "sequential",
});
