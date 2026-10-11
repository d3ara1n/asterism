import { z } from "zod";
import { defineImplementation } from "@atelier/sdk/contracts";
import { core } from "../plugin.ts";
import { Read, Edit, Write } from "../shared/declarations.ts";
import { textReadSchema, textChangeSchema } from "../shared/text-contract.ts";

export const Note = core.resource("note", z.object({}));
export const NoteView = core.data("note.card", 1, z.strictObject({ text: z.string().nullable() }));
const targetSchema = z.null().describe("Pass null to select this note's complete current text. Notes have no internal path or read range. Content is limited to 100,000 UTF-16 code units; edits must keep the final text within that limit.");
export const NoteRead = defineImplementation({
  ...core.data("note.read", 1, textReadSchema),
  resource: Note, tool: Read, targetSchema, effect: "read", execution: "parallel",
});
export const NoteEdit = defineImplementation({
  ...core.data("note.edit", 1, textChangeSchema),
  resource: Note, tool: Edit, targetSchema, effect: "write", execution: "sequential",
});
export const NoteWrite = defineImplementation({
  ...core.data("note.write", 1, textChangeSchema),
  resource: Note, tool: Write, targetSchema, effect: "write", execution: "sequential",
});
