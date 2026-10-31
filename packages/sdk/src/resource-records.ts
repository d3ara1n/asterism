import { z } from "zod";
import { defineRecord } from "./records.ts";
import { jsonSchema } from "./json.ts";

/** A new resource identity, including template instances. data is the resource's encoded creation state. */
export const ResourceCreated = defineRecord("resource_created", {
  schema: z.object({
    id: z.string(),
    type: z.string().min(1),
    title: z.string(),
    data: jsonSchema,
  }),
});

/** A title assignment on the resource's history path. */
export const ResourceRenamed = defineRecord("resource_renamed", {
  schema: z.object({ id: z.string(), title: z.string() }),
});

/** Removal from the current history path; the resource identity and earlier records remain in history. */
export const ResourceRemoved = defineRecord("object_removed", {
  schema: z.object({ id: z.string() }),
});

/** id is the resource made available to receiverId; both endpoints are resource identities. */
const linkSchema = z.object({ id: z.string(), receiverId: z.string() });
export const ResourceAttached = defineRecord("resource_attached", { schema: linkSchema });
export const ResourceDetached = defineRecord("resource_detached", { schema: linkSchema });
