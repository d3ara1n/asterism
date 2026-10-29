import { z } from "zod";
import { defineRecord } from "./records.ts";
import { presentationSchema } from "./presentation.ts";

/** Immutable title assignment; optional detail belongs to the plugin that produced it. */
export const SessionTitleAssigned = defineRecord("asterism.session/title", {
  schema: z.strictObject({ title: z.string().trim().min(1).max(160), detail: presentationSchema.optional() }),
});
