import { z } from "zod";
import { coreChannel } from "./core.ts";

export const crashReportsGetChannel = coreChannel("crash-reports:get");
export const crashReportsSetChannel = coreChannel("crash-reports:set");
export const crashReportsArgument = "--asterism-crash-reports";
export const crashReportsStateSchema = z.strictObject({ enabled: z.boolean(), restartRequired: z.boolean() });
export type CrashReportsState = z.infer<typeof crashReportsStateSchema>;
export interface CrashReportsBridge {
  readonly active: boolean;
  get(): Promise<CrashReportsState>;
  set(enabled: boolean): Promise<CrashReportsState>;
}
