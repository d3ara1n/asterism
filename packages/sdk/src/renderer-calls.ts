import { createContext, useContext } from "react";
import type { PluginCalls } from "./calls.ts";

const Calls = createContext<PluginCalls | null>(null);
export const RendererCallsProvider = Calls.Provider;
/** Invoke a registered backend contract; associating an object does not change resource ownership. */
export function useRendererCalls(): PluginCalls {
  const calls = useContext(Calls);
  if (!calls) throw new Error("Renderer calls must be provided by the host.");
  return calls;
}
