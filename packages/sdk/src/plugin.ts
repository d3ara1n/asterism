import type { z } from "zod";
import type { Json } from "./json.ts";
import { bindMessages, type SourceMessage, type UiMessage } from "./i18n.ts";
import { defineData, type DataContract } from "./presentation.ts";
import { defineResource, type ResourceContract } from "./module-contract.ts";
import { defineConfig, type ConfigContract } from "./config.ts";
import type { ConfigurationPresentation } from "./i18n.ts";

const pluginIdPattern = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u;
const shortNamePattern = /^[a-z0-9][a-z0-9._-]*$/u;

/**
 * 插件命名空间：插件身份只在此声明一次，契约文件以短名声明资源类型与数据契约，
 * 由此补全为 `<pluginId>/<name>`。纯契约，前后端共用。
 */
export interface PluginNamespace {
  readonly id: string;
  messages<T extends Record<string, SourceMessage>>(sourceLocale: string, definitions: T): { readonly [K in keyof T]: UiMessage };
  name(short: string): string;
  resource<S extends Json>(name: string, stateSchema: z.ZodType<S>): ResourceContract<S>;
  data<T extends Json>(name: string, schema: z.ZodType<T>): DataContract<T>;
  /** 插件唯一的用户配置契约。 */
  config<T extends Json>(schema: z.ZodType<T>, defaults: NoInfer<T>, options?: { presentation?: ConfigurationPresentation }): ConfigContract<T>;
}
export function pluginNamespace(id: string): PluginNamespace {
  if (!pluginIdPattern.test(id)) throw new Error(`Invalid plugin ID: ${id}`);
  const name = (short: string) => {
    if (!shortNamePattern.test(short)) throw new Error(`Invalid short name in plugin ${id}: ${short}`);
    return `${id}/${short}`;
  };
  return {
    id, name,
    messages: (sourceLocale, definitions) => bindMessages(id, sourceLocale, definitions),
    resource: (short, stateSchema) => defineResource(name(short), stateSchema),
    data: (short, schema) => defineData(name(short), schema),
    config: (schema, defaults, options) => defineConfig(id, schema, defaults, options),
  };
}
export function belongsTo(pluginId: string, qualified: string): boolean {
  return qualified.startsWith(`${pluginId}/`) && qualified.length > pluginId.length + 1;
}
/** 从带命名空间的 ID 取来源插件；无命名空间时返回 null。 */
export function pluginOf(qualified: string): string | null {
  const index = qualified.indexOf("/");
  return index > 0 ? qualified.slice(0, index) : null;
}
/** 实现缺失的资源投影：保留原始数据与来源插件，供界面回退展示。 */
export const missingResourceContract = { id: "atelier.core/missing-resource" } as const;
