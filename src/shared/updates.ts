import { z } from "zod";
import { coreChannel } from "./core.ts";

export const updatesGetChannel = coreChannel("updates-get");
export const updatesSetChannel = coreChannel("updates-set");
export const updatesCheckChannel = coreChannel("updates-check");
export const updatesInstallChannel = coreChannel("updates-install");
export const updatesChangedChannel = coreChannel("updates-changed");

export const updateStateSchema = z.strictObject({
  version: z.string(),
  enabled: z.boolean(),
  includePrerelease: z.boolean(),
  status: z.enum(["idle", "checking", "current", "downloading", "ready", "error"]),
  availableVersion: z.string().nullable(),
  progress: z.number(),
  error: z.string().nullable(),
});
export type UpdateState = z.infer<typeof updateStateSchema>;
export interface UpdatesBridge {
  get(): Promise<UpdateState>;
  set(includePrerelease: boolean): Promise<UpdateState>;
  check(): Promise<UpdateState>;
  install(): Promise<void>;
  onChanged(listener: (state: UpdateState) => void): () => void;
}
