import type { RuntimeStatus } from "../../../shared/contracts";
import type { SessionViewState } from "../session/controller";

export type WorkbenchPhase = "ready" | "loading" | "starting" | "unavailable" | "read-error";

/** 展示状态不复用操作门禁：不可写既可能是等待，也可能是失败。 */
export function workbenchPhase(runtime: RuntimeStatus, session: Pick<SessionViewState, "status"> | null): WorkbenchPhase {
  if (runtime === "unavailable" || runtime === "stopping") return "unavailable";
  if (runtime === "starting") return "starting";
  if (session?.status === "error") return "read-error";
  if (!session || session.status === "loading") return "loading";
  return "ready";
}
