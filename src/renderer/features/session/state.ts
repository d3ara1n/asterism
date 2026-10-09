import { useEffect, useSyncExternalStore } from "react";
import type { SessionController } from "./controller";

export function useSession(controller: SessionController) {
  useEffect(() => controller.connect(), [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { state, snapshot: state.snapshot, historical: state.position.kind === "history" };
}
export function useSessionProgress(controller: SessionController) {
  return useSyncExternalStore(controller.subscribeProgress, controller.getProgress);
}
