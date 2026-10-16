import * as contracts from "@atelier/builtin-api/contracts";
import metadata from "../packages/builtin-api/package.json" with { type: "json" };
import type { PublicProvider } from "./shared/public-modules.ts";

/** 应用组合声明静态内置公共提供方，宿主加载器不导入内置领域。 */
export const builtinPublicModules = { "@atelier/builtin-api/contracts": contracts };
const exports = { "@atelier/builtin-api/contracts": Object.keys(contracts) };
export const builtinPublicProvider: PublicProvider = {
  name: metadata.name, version: metadata.version, pluginId: contracts.builtin.id,
  modules: { runtime: exports, renderer: {
    ...exports,
    "@atelier/builtin-api/renderer": ["agentUI", "AgentOverlay", "AgentModal", "AgentUIRendererProvider"],
  } },
};
