import { z } from "zod";
import { coreChannel } from "./core.ts";
import { pluginStorageFailureSchema, preparationStageSchema, recoveryPointSchema, type PluginStorageFailure, type RecoveryAction } from "./recovery.ts";

export const startupGetChannel = coreChannel("startup-get");
export const startupChangedChannel = coreChannel("startup-changed");
export const startupRestartChannel = coreChannel("startup-restart");
export const startupDataDirectoryChannel = coreChannel("startup-data-directory");
export const startupRecoveryChannel = coreChannel("startup-recovery");
export const startupRecoveryPointChannel = coreChannel("startup-recovery-point");
export const startupInitializedChannel = coreChannel("startup-initialized");
/** Data preparation stages are independent of host settings readability; environment stages begin with actual login-environment reads. */
export const startupStageSchema = z.enum([...preparationStageSchema.options, "dataFinalizing", "environment", "plugins", "workspace"]);
export type StartupStage = z.infer<typeof startupStageSchema>;
/** Data preparation failures include optional recovery points; `paused` means awaiting user retry after restoration. */
export const startupRecoverySchema = z.strictObject({ paused: z.boolean(), points: z.array(recoveryPointSchema) });
export const startupStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("starting"), stage: startupStageSchema, detail: z.string().optional() }),
  z.strictObject({ status: z.literal("ready") }),
  z.strictObject({ status: z.literal("failed"), reason: z.enum(["initialization", "database_version", "data", "timeout", "runtime"]), detail: z.string(),
    recovery: startupRecoverySchema.optional() }),
]);
export type StartupState = z.infer<typeof startupStateSchema>;
/** One-time startup notice obtained after home mounts: plugins disabled by storage preparation failure during this startup. */
export const startupNotificationsSchema = z.array(pluginStorageFailureSchema);

/** Main processes retain startup state so reloaded loading pages can still read failure reasons. */
export interface StartupBridge {
  get(): Promise<StartupState>;
  onChanged(listener: (state: StartupState) => void): () => void;
  restart(): Promise<void>;
  openDataDirectory(): Promise<string>;
  /** Perform recovery and restart; a returned string explains failure. */
  recover(action: RecoveryAction): Promise<string | void>;
  openRecoveryPoint(id: string): Promise<string>;
  initialized(): Promise<PluginStorageFailure[]>;
}
