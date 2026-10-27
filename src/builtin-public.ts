import * as contracts from "@asterism-app/builtin-api/contracts";
import metadata from "../packages/builtin-api/package.json" with { type: "json" };
import type { PublicProvider } from "./shared/public-modules.ts";

/** Application composition declares static built-in public providers; the host loader does not import built-in domains. */
export const builtinPublicModules = { "@asterism-app/builtin-api/contracts": contracts };
const exports = { "@asterism-app/builtin-api/contracts": Object.keys(contracts) };
export const builtinPublicProvider: PublicProvider = {
  name: metadata.name, pluginId: contracts.builtin.id,
  modules: { runtime: { ...exports, "@asterism-app/builtin-api/runtime": ["agentCreations", "defineAgentCreation", "agentServices", "registerAgentServices"] }, renderer: {
    ...exports,
    "@asterism-app/builtin-api/renderer": ["agentUI", "AgentToolbarItem", "AgentOverlay", "AgentModal", "AgentScrollArea",
      "useAgentModelSelection", "AgentModelSelectionProvider", "AgentUIRendererProvider"],
  } },
};
