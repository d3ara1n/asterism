import { z } from "zod";
import { coreChannel } from "./core.ts";

export const startupGetChannel = coreChannel("startup-get");
export const startupChangedChannel = coreChannel("startup-changed");
export const startupRestartChannel = coreChannel("startup-restart");
export const startupDataDirectoryChannel = coreChannel("startup-data-directory");
export const startupStageSchema = z.enum(["environment", "plugins", "workspace"]);
export type StartupStage = z.infer<typeof startupStageSchema>;
export const startupStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("starting"), stage: startupStageSchema, detail: z.string().optional() }),
  z.strictObject({ status: z.literal("ready") }),
  z.strictObject({ status: z.literal("failed"), reason: z.enum(["initialization", "database_version", "timeout", "runtime"]), detail: z.string() }),
]);
export type StartupState = z.infer<typeof startupStateSchema>;

/** 启动状态由主进程保存，加载页重载后仍能读取失败原因。 */
export interface StartupBridge {
  get(): Promise<StartupState>;
  onChanged(listener: (state: StartupState) => void): () => void;
  restart(): Promise<void>;
  openDataDirectory(): Promise<string>;
}
