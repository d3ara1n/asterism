import { useEffect, useSyncExternalStore } from "react";
import type { SessionController } from "./controller";

export function useSession(controller: SessionController) {
  useEffect(() => controller.connect(), [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { state, snapshot: state.data };
}
/** 资源忙碌与时间线创建中；流式增量不触发重渲染。 */
export function useSessionActivity(controller: SessionController) {
  return useSyncExternalStore(controller.subscribeProgress, controller.getActivity);
}
/** 单个对象的实时块；只在本对象的块变化时重渲染。 */
export function useObjectLive(controller: SessionController, objectId: string) {
  return useSyncExternalStore(controller.subscribeProgress, () => controller.liveOf(objectId));
}
