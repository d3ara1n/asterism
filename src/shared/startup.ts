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
/** 数据准备阶段独立于宿主设置可读性；环境阶段从实际读取登录环境开始。 */
export const startupStageSchema = z.enum([...preparationStageSchema.options, "dataFinalizing", "environment", "plugins", "workspace"]);
export type StartupStage = z.infer<typeof startupStageSchema>;
/** 数据准备失败时附带可选恢复点；`paused` 表示还原后等待用户重试。 */
export const startupRecoverySchema = z.strictObject({ paused: z.boolean(), points: z.array(recoveryPointSchema) });
export const startupStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("starting"), stage: startupStageSchema, detail: z.string().optional() }),
  z.strictObject({ status: z.literal("ready") }),
  z.strictObject({ status: z.literal("failed"), reason: z.enum(["initialization", "database_version", "data", "timeout", "runtime"]), detail: z.string(),
    recovery: startupRecoverySchema.optional() }),
]);
export type StartupState = z.infer<typeof startupStateSchema>;
/** 首页挂载后一次性取得的启动通知：本次因存储准备失败而停用的插件。 */
export const startupNotificationsSchema = z.array(pluginStorageFailureSchema);

/** 启动状态由主进程保存，加载页重载后仍能读取失败原因。 */
export interface StartupBridge {
  get(): Promise<StartupState>;
  onChanged(listener: (state: StartupState) => void): () => void;
  restart(): Promise<void>;
  openDataDirectory(): Promise<string>;
  /** 执行恢复操作并重启；返回字符串表示失败说明。 */
  recover(action: RecoveryAction): Promise<string | void>;
  openRecoveryPoint(id: string): Promise<string>;
  initialized(): Promise<PluginStorageFailure[]>;
}
