import { createContext, useContext, type ReactNode } from "react";
import type { RendererCommandGroup } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";

export interface RegisteredCommandGroup extends RendererCommandGroup { pluginId: string; pluginName: UiText }
const Commands = createContext<readonly RegisteredCommandGroup[]>([]);
export function PluginCommandsProvider({ groups, children }: { groups: readonly RegisteredCommandGroup[]; children: ReactNode }) {
  return <Commands.Provider value={groups}>{children}</Commands.Provider>;
}
export const usePluginCommands = () => useContext(Commands);
