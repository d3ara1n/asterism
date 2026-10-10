import { z } from "zod";
import { defineData } from "../../shared/presentation.ts";
import { defineResource } from "../../shared/module-contract.ts";

export const Note = defineResource("note", z.object({ contentRef: z.string().regex(/^[a-f0-9]{64}$/) }));
export const NoteView = defineData("weft.note.card", 1, z.strictObject({ text: z.string().nullable() }));
