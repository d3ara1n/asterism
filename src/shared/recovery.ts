import { z } from "zod";

export const storageChangeSchema = z.object({ id: z.string(), from: z.number().int(), to: z.number().int() });
/** 恢复点：迁移前复制，或还原／重新开始前移走的整组应用数据。 */
export const recoveryPointSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  kind: z.enum(["migration", "before-restore", "before-fresh"]),
  createdAt: z.string(),
  applicationVersion: z.string(),
  changes: z.array(storageChangeSchema),
  /** 迁移成功后待提示；用户确认后清除。 */
  notice: z.boolean(),
});
export type RecoveryPoint = z.infer<typeof recoveryPointSchema>;

export const pluginStorageFailureSchema = z.object({ id: z.string(), error: z.string() });
export type PluginStorageFailure = z.infer<typeof pluginStorageFailureSchema>;

export const preparationResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), plugins: z.array(pluginStorageFailureSchema) }),
  /** `paused` 表示还原后暂停自动迁移，等待用户重试。 */
  z.object({ ok: z.literal(false), error: z.string(), paused: z.boolean() }),
]);
export type PreparationResult = z.infer<typeof preparationResultSchema>;

/** 准备进程消息：宿主存储就绪状态先于最终结果发出。 */
export const preparationMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("host"), status: z.enum(["migrating", "ready"]) }),
  z.object({ kind: z.literal("result"), result: preparationResultSchema }),
  z.object({ kind: z.literal("error"), error: z.string() }),
]);
export type PreparationMessage = z.infer<typeof preparationMessageSchema>;

export const recoveryActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("retry") }),
  z.object({ kind: z.literal("fresh") }),
  z.object({ kind: z.literal("restore"), point: z.string().min(1) }),
]);
export type RecoveryAction = z.infer<typeof recoveryActionSchema>;
