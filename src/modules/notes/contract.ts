import { z } from "zod";
import { defineData } from "../../shared/presentation.ts";
import { defineImplementation, defineResource } from "../../shared/module-contract.ts";
import { Read } from "../../tools/declarations.ts";

export const Note = defineResource("note", z.object({ contentRef: z.string().regex(/^[a-f0-9]{64}$/) }));
export const NoteView = defineData("weft.note.card", 1, z.strictObject({ text: z.string().nullable() }));
export const NoteRead = defineImplementation({
  ...defineData("weft.note.read", 1, z.strictObject({ text: z.string() })),
  resource: Note, tool: Read, targetSchema: z.null(),
  description: "Read the full note text. Omit target to read the note itself.",
  effect: "read", execution: "parallel",
});
