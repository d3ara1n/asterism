import type { RuntimeStatus } from "../../../shared/contracts";
import type { SessionViewState } from "../session/controller";

export type WorkbenchPhase = "ready" | "loading" | "starting" | "stopping" | "unavailable" | "read-error";

/** Display state does not reuse the operation gate: inability to write may mean either waiting or failure. */
export function workbenchPhase(runtime: RuntimeStatus, session: Pick<SessionViewState, "status"> | null): WorkbenchPhase {
  if (runtime === "stopping") return "stopping";
  if (runtime === "unavailable") return "unavailable";
  if (runtime === "starting") return "starting";
  if (session?.status === "error") return "read-error";
  if (!session || session.status === "loading") return "loading";
  return "ready";
}
