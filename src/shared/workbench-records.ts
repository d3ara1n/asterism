import { z } from "zod";
import { defineRecord } from "@asterism/sdk/contracts";

/** 宿主工作台事件的记录契约；载荷由运行时工作台写入，展示由宿主工作台模块提供。 */
const target = z.object({ id: z.string() });
export const ResourceCreated = defineRecord("resource_created", { schema: z.object({ id: z.string(), type: z.string(), title: z.string() }) });
export const ResourceRenamed = defineRecord("resource_renamed", { schema: z.object({ id: z.string(), title: z.string() }) });
export const ObjectAdded = defineRecord("object_added", { schema: target });
export const ObjectRemoved = defineRecord("object_removed", { schema: target });
const link = z.object({ id: z.string(), receiverId: z.string() });
export const ResourceAttached = defineRecord("resource_attached", { schema: link });
export const ResourceDetached = defineRecord("resource_detached", { schema: link });
export const workbenchRecords = [ResourceCreated, ResourceRenamed, ObjectAdded, ObjectRemoved, ResourceAttached, ResourceDetached] as const;
