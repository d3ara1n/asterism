import type { z } from "zod";
import type { Json } from "./json.ts";
import { defineData, type DataContract } from "./presentation.ts";
import { defineResource, type ResourceContract } from "./module-contract.ts";

const pluginIdPattern = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u;
const shortNamePattern = /^[a-z0-9][a-z0-9._-]*$/u;

/**
 * 插件命名空间：插件身份只在此声明一次，契约文件以短名声明资源类型与数据契约，
 * 由此补全为 `<pluginId>/<name>`。纯契约，前后端共用。
 */
export interface PluginNamespace {
  readonly id: string;
  name(short: string): string;
  resource<S extends Json>(name: string, stateSchema: z.ZodType<S>): ResourceContract<S>;
  data<T extends Json>(name: string, version: number, schema: z.ZodType<T>): DataContract<T>;
}
export function pluginNamespace(id: string): PluginNamespace {
  if (!pluginIdPattern.test(id)) throw new Error(`Invalid plugin ID: ${id}`);
  const name = (short: string) => {
    if (!shortNamePattern.test(short)) throw new Error(`Invalid short name in plugin ${id}: ${short}`);
    return `${id}/${short}`;
  };
  return {
    id, name,
    resource: (short, stateSchema) => defineResource(name(short), stateSchema),
    data: (short, version, schema) => defineData(name(short), version, schema),
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
export const missingResourceContract = { id: "atelier.core/missing-resource", version: 1 } as const;
