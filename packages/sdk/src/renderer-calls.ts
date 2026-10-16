import { createContext, useContext } from "react";
import type { PluginCalls } from "./calls.ts";

const Calls = createContext<PluginCalls | null>(null);
export const RendererCallsProvider = Calls.Provider;
/** 调用已注册的后台契约；关联对象不改变资源所有权。 */
export function useRendererCalls(): PluginCalls {
  const calls = useContext(Calls);
  if (!calls) throw new Error("Renderer calls must be provided by the host.");
  return calls;
}
