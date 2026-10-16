import type { ResourceRef } from "@atelier/sdk/contracts";

const listeners = new Set<(object: ResourceRef, id: string) => void>();
/** 工具执行视图到同一 Agent 作答面板的局部导航，不改变业务等待。 */
export const questionFocus = {
  subscribe(listener: (object: ResourceRef, id: string) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  open(object: ResourceRef, id: string) { for (const listener of listeners) listener(object, id); },
};
