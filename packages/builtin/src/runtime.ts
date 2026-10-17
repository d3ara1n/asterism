import { definePlugin } from "@atelier/sdk/runtime";
import { builtin, type NamingApi } from "@atelier/builtin-api/contracts";
import metadata from "../package.json" with { type: "json" };
import type { BuiltinApplication } from "./application.ts";
import { createAgentModule } from "./agent/runtime.ts";
import filesystem from "./filesystem/runtime.ts";
import notes from "./notes/runtime.ts";
import { BuiltinSettings } from "./settings/contract.ts";
import { createNamingModule } from "./naming/runtime.ts";
import questions from "./questions/runtime.ts";

/** 仅组合插件业务；加载、宿主服务及外部插件依赖由应用负责。 */
export function createBuiltin(options: { application: BuiltinApplication; connectNaming(api: NamingApi): () => void }) {
  return definePlugin({ namespace: builtin, version: metadata.version,
    setup(plugin) {
      plugin.config(BuiltinSettings);
      return { modules: [createAgentModule(options.application), filesystem, createNamingModule(options.connectNaming, options.application.userAgent), notes, questions] };
    } });
}
export { createSelection } from "./agent/selection.ts";
export { composeSystemPrompt } from "./agent/system-prompt.ts";
export type { BuiltinApplication } from "./application.ts";
export { builtinMetadata } from "./metadata.ts";
