import { z } from "zod";
import { defineImplementation, defineCreation } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";
import { Read, Edit, Write } from "../shared/declarations.ts";
import { textReadSchema, textChangeSchema } from "../shared/text-contract.ts";

export const MAX_NOTE_LENGTH = 100_000;
export const Note = core.resource("note", z.object({}));
export const CreateNote = defineCreation(Note, { id: core.name("note.create"),
  schema: z.strictObject({ title: z.string().trim().min(1).max(160).default("Untitled note"), content: z.string().max(MAX_NOTE_LENGTH).default("") }),
});
export const NoteContent = core.data("note.content", z.strictObject({ text: z.string().max(MAX_NOTE_LENGTH) }));
export const NoteView = core.data("note.card", z.strictObject({ text: z.string().nullable() }));
const targetSchema = z.null().describe("Pass null to select this note's complete current text. Notes have no internal path or read range. Content is limited to 100,000 UTF-16 code units; edits must keep the final text within that limit.");
export const NoteRead = defineImplementation({
  ...core.data("note.read", textReadSchema),
  resource: Note, tool: Read, targetSchema, effect: "read", execution: "parallel",
});
export const NoteEdit = defineImplementation({
  ...core.data("note.edit", textChangeSchema),
  resource: Note, tool: Edit, targetSchema, effect: "write", execution: "sequential",
});
export const NoteWrite = defineImplementation({
  ...core.data("note.write", textChangeSchema),
  resource: Note, tool: Write, targetSchema, effect: "write", execution: "sequential",
});
