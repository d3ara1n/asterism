import { z } from "zod";

export const migrationChangeSchema = z.object({ id: z.string(), from: z.number().int(), to: z.number().int() });
export const migrationReportSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  status: z.enum(["preparing", "migrating", "succeeded", "failed", "restoring", "restored", "resetting", "reset"]),
  createdAt: z.string(), applicationVersion: z.string(),
  changes: z.array(migrationChangeSchema),
  backup: z.string().nullable(), backupComplete: z.boolean(),
  error: z.string().nullable(), acknowledged: z.boolean(),
  /** 恢复操作保存原现场后逐项替换；中断后依此继续。 */
  operation: z.object({ archive: z.string(), originals: z.array(z.string()) }).optional(),
});
export type MigrationReport = z.infer<typeof migrationReportSchema>;
export const dataPreparationResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), report: migrationReportSchema.nullable() }),
  z.object({ ok: z.literal(false), report: migrationReportSchema }),
]);
export type DataPreparationResult = z.infer<typeof dataPreparationResultSchema>;
export const recoveryActionSchema = z.enum(["retry", "restore", "fresh"]);
export type RecoveryAction = z.infer<typeof recoveryActionSchema>;
