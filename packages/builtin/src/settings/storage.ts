import type { PluginStorageDeclaration } from "@atelier/sdk/runtime";
import { jsonSchema } from "@atelier/sdk/contracts";
import { BuiltinSettings } from "./contract.ts";

/** 内置领域与外部插件使用同一个窗口前存储声明。 */
export const builtinStorage: readonly PluginStorageDeclaration[] = [{
  kind: "json", path: ".atelier/config.json", version: 1, unversioned: true,
  initial: () => structuredClone(BuiltinSettings.defaults),
  migrations: { 0: value => jsonSchema.parse(BuiltinSettings.schema.parse(value)) },
  validate: value => BuiltinSettings.schema.parse(value),
}];
