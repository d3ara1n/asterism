import { useEffect, useSyncExternalStore } from "react";
import type { SessionController } from "./controller";

export function useSession(controller: SessionController) {
  useEffect(() => controller.connect(), [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { state, snapshot: state.data };
}
/** Resource busy state and timeline creation in progress; streaming deltas do not trigger rerenders. */
export function useSessionActivity(controller: SessionController) {
  return useSyncExternalStore(controller.subscribeProgress, controller.getActivity);
}
/** Live blocks for one object; rerender only when this object's blocks change. */
export function useObjectLive(controller: SessionController, objectId: string) {
  return useSyncExternalStore(controller.subscribeProgress, () => controller.liveOf(objectId));
}
