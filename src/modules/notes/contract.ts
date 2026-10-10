import { z } from "zod";
import { defineData } from "../../shared/presentation.ts";
import { defineImplementation, defineResource } from "../../shared/module-contract.ts";
import { Read, Edit, Write } from "../../tools/declarations.ts";
import { textReadSchema, textChangeSchema } from "../../tools/text-contract.ts";

export const Note = defineResource("note", z.object({}));
export const NoteView = defineData("weft.note.card", 1, z.strictObject({ text: z.string().nullable() }));
const targetSchema = z.null().describe("Pass null to select this note's complete current text. Notes have no internal path or read range. Content is limited to 100,000 UTF-16 code units; edits must keep the final text within that limit.");
export const NoteRead = defineImplementation({
  ...defineData("weft.note.read", 1, textReadSchema),
  resource: Note, tool: Read, targetSchema, effect: "read", execution: "parallel",
});
export const NoteEdit = defineImplementation({
  ...defineData("weft.note.edit", 1, textChangeSchema),
  resource: Note, tool: Edit, targetSchema, effect: "write", execution: "sequential",
});
export const NoteWrite = defineImplementation({
  ...defineData("weft.note.write", 1, textChangeSchema),
  resource: Note, tool: Write, targetSchema, effect: "write", execution: "sequential",
});
