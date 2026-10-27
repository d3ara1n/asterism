import { z } from "zod";

/** A JSON reference value reserved by the SDK; identity contains no path and grants no right to read or retain content. */
export const contentRefSchema = z.strictObject({ "$asterism.content": z.string().uuid() });
export type ContentRef = z.infer<typeof contentRefSchema>;
export interface ContentRange { offset?: number; length?: number }
