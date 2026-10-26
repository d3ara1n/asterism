import { z } from "zod";

/** SDK 保留的 JSON 引用值；身份不包含路径，也不授予内容读取或保留权。 */
export const contentRefSchema = z.strictObject({ "$asterism.content": z.string().uuid() });
export type ContentRef = z.infer<typeof contentRefSchema>;
export interface ContentRange { offset?: number; length?: number }
