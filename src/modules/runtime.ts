/// <reference types="vite/client" />
import { ResourceRegistry } from "../resources/registry.ts";
import { ToolRegistry } from "../tools/registry.ts";
import type { RuntimeModuleFactory } from "./runtime-contract.ts";

const entries = import.meta.glob<RuntimeModuleFactory>("./*/runtime.ts", { eager: true, import: "default" });

/** 编译期收集后台入口；前端入口不会进入任务运行时的依赖图。 */
export function createModules(services: Parameters<RuntimeModuleFactory>[0]) {
  const modules = Object.keys(entries).sort().map(path => entries[path]!(services));
  const resources = new ResourceRegistry(modules.flatMap(module => module.resources));
  const tools = new ToolRegistry(modules.flatMap(module => module.tools));
  return { resources, tools };
}
