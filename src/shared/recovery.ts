import { z } from "zod";

export const storageChangeSchema = z.object({ id: z.string(), from: z.number().int(), to: z.number().int() });
/** Recovery point: the complete application data set copied before migration or moved before restoration/restart from scratch. */
export const recoveryPointSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  kind: z.enum(["migration", "before-restore", "before-fresh"]),
  createdAt: z.string(),
  applicationVersion: z.string(),
  changes: z.array(storageChangeSchema),
  /** Pending prompt after successful migration; cleared on user acknowledgment. */
  notice: z.boolean(),
});
export type RecoveryPoint = z.infer<typeof recoveryPointSchema>;

export const pluginStorageFailureSchema = z.object({ id: z.string(), error: z.string() });
export type PluginStorageFailure = z.infer<typeof pluginStorageFailureSchema>;

export const preparationResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), plugins: z.array(pluginStorageFailureSchema), pluginBuild: z.string().optional() }),
  /** `paused` means automatic migration is paused after restoration, awaiting user retry. */
  z.object({ ok: z.literal(false), error: z.string(), paused: z.boolean() }),
]);
export type PreparationResult = z.infer<typeof preparationResultSchema>;

/** Actual data preparation stage; separate messages report host settings readability. */
export const preparationStageSchema = z.enum(["dataCheck", "dataBackup", "data", "dataPlugins"]);
export type PreparationStage = z.infer<typeof preparationStageSchema>;
export interface PreparationProgress { stage: PreparationStage; detail?: string }

/** Final results mean commits and resource cleanup are complete; the main process terminates preparation on receipt. */
export const preparationMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("host"), status: z.enum(["migrating", "ready"]) }),
  z.object({ kind: z.literal("progress"), stage: preparationStageSchema, detail: z.string().optional() }),
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
