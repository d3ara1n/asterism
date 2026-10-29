import { createContext, useContext } from "react";
import type { CallContract, PluginCalls } from "./calls.ts";
import type { RendererContentInput } from "./renderer-content.ts";

export interface RendererCalls extends PluginCalls<RendererContentInput> {
  input(contract: CallContract): RendererContentInput;
}
const Calls = createContext<RendererCalls | null>(null);
export const RendererCallsProvider = Calls.Provider;
/** Invoke a registered backend contract; associating an object does not change resource ownership. */
export function useRendererCalls(): RendererCalls {
  const calls = useContext(Calls);
  if (!calls) throw new Error("Renderer calls must be provided by the host.");
  return calls;
}
