import { z } from "zod";
import { jsonSchema } from "@asterism/sdk/contracts";
import { workbenchSnapshotSchema } from "./workbench.ts";

const id = z.string().min(1).max(160);
export const templateObjectSummarySchema = z.strictObject({ id, kind: id, title: z.string() });
export const templateSummarySchema = z.strictObject({
  id: z.string().uuid(), title: z.string(), createdAt: z.string(),
  objects: z.array(templateObjectSummarySchema),
});
export type TemplateObjectSummary = z.infer<typeof templateObjectSummarySchema>;
export type TemplateSummary = z.infer<typeof templateSummarySchema>;

/** Static object data and relationships; entry identities serve internal template association only. */
export const templateDataSchema = z.strictObject({
  objects: z.array(templateObjectSummarySchema.extend({
    data: z.record(z.string(), jsonSchema),
    current: z.array(z.strictObject({ contract: id, data: jsonSchema })),
  })),
  links: workbenchSnapshotSchema.shape.links,
  views: workbenchSnapshotSchema.shape.views,
});
export type TemplateData = z.infer<typeof templateDataSchema>;
export const templateCommands = [
  z.strictObject({ type: z.literal("template.source"), sessionId: id }),
  z.strictObject({ type: z.literal("template.save"), sessionId: id,
    title: z.string().trim().min(1).max(160), objectIds: z.array(id).min(1) }),
  z.strictObject({ type: z.literal("template.start"), templateId: z.string().uuid() }),
  z.strictObject({ type: z.literal("template.delete"), templateId: z.string().uuid() }),
] as const;
