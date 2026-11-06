import { z } from "zod";
import { jsonSchema } from "@asterism-app/sdk/contracts";
import { sessionIslandSchema, workbenchSnapshotSchema } from "./workbench.ts";
import { folderIdSchema } from "./folders.ts";

const id = z.string().min(1).max(160);
export const templateObjectSummarySchema = z.strictObject({ id, kind: id, title: z.string().optional() });
export const templateSummarySchema = z.strictObject({
  id: z.string().uuid(), title: z.string(), createdAt: z.string(), folderId: folderIdSchema,
  objects: z.array(templateObjectSummarySchema),
});
export type TemplateObjectSummary = z.infer<typeof templateObjectSummarySchema>;
export type TemplateSummary = z.infer<typeof templateSummarySchema>;

/** Static object data, relationships, and initial layout; entry identities serve internal template association only. */
export const templateDataSchema = z.strictObject({
  objects: z.array(templateObjectSummarySchema.extend({
    data: jsonSchema,
    current: z.array(z.strictObject({ contract: id, data: jsonSchema })),
  })),
  links: workbenchSnapshotSchema.shape.links,
  views: workbenchSnapshotSchema.shape.views,
  /** Only object islands are reusable; templates saved before this layout field open no islands. */
  islands: z.array(z.strictObject({ objectId: id, size: sessionIslandSchema.shape.size })).default([]),
});
export type TemplateData = z.infer<typeof templateDataSchema>;
export const templateCommands = [
  z.strictObject({ type: z.literal("template.source"), sessionId: id }),
  // New sessions started from the template land in folderId; null leaves them without a folder.
  z.strictObject({ type: z.literal("template.save"), sessionId: id,
    title: z.string().trim().min(1).max(160), objectIds: z.array(id).min(1), folderId: folderIdSchema }),
  z.strictObject({ type: z.literal("template.start"), templateId: z.string().uuid() }),
  z.strictObject({ type: z.literal("template.rename"), templateId: z.string().uuid(),
    title: z.string().trim().min(1).max(160) }),
  z.strictObject({ type: z.literal("template.delete"), templateId: z.string().uuid() }),
] as const;
