import { z } from "zod";
import { contentRefSchema } from "./content.ts";

/** mediaType 为客户端如实识别的 MIME，随字节发送；客户端不据此判断模型能力，是否接受由服务端反馈。 */
export const mediaTypeSchema = z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/);

/** 模型输入只有文字与文件；文件保存不可变内容身份和消费元数据，字节与读取资格不进入消息。 */
export const modelInputPartSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), text: z.string() }),
  z.strictObject({ kind: z.literal("file"), file: contentRefSchema,
    mediaType: mediaTypeSchema, filename: z.string().min(1).max(255).optional() }),
]);
export type ModelInputPart = z.infer<typeof modelInputPartSchema>;
export type ModelFilePart = Extract<ModelInputPart, { kind: "file" }>;
export const modelInputPartsSchema = z.array(modelInputPartSchema).min(1);
/** 纯文字消费者显式提取正文，不隐式读取文件。 */
export function modelInputText(parts: readonly (Extract<ModelInputPart, { kind: "text" }> | { kind: "file" })[]): string {
  return parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n");
}
