import { z } from "zod";

/** Folder theme colors are palette tokens; each scheme resolves them through `--folder-<token>` CSS variables. */
export const folderColors = ["red", "orange", "amber", "green", "teal", "blue", "violet", "pink"] as const;
export const folderColorSchema = z.enum(folderColors);
export type FolderColor = z.infer<typeof folderColorSchema>;

const uuid = z.string().uuid();
export const folderNameSchema = z.string().trim().min(1).max(80);
export const folderSchema = z.strictObject({ id: uuid, name: z.string(), color: folderColorSchema, createdAt: z.string() });
export type Folder = z.infer<typeof folderSchema>;
/** Membership target: a folder identity, or null for no folder. */
export const folderIdSchema = uuid.nullable();

/** Callers choose folder identities so a created folder can be selected immediately without diffing catalogs. */
export const folderCommands = [
  z.strictObject({ type: z.literal("folder.create"), id: uuid, name: folderNameSchema, color: folderColorSchema }),
  z.strictObject({ type: z.literal("folder.update"), id: uuid, name: folderNameSchema, color: folderColorSchema }),
  z.strictObject({ type: z.literal("folder.delete"), id: uuid }),
  z.strictObject({ type: z.literal("session.move"), sessionId: uuid, folderId: folderIdSchema }),
  z.strictObject({ type: z.literal("template.move"), templateId: uuid, folderId: folderIdSchema }),
] as const;
