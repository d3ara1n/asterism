import type { z } from "zod";
import type { Json } from "./json.ts";

/**
 * 插件配置契约：用户与插件协商的设置，一个插件一份，前后台共享。
 * 身份即插件 ID；宿主负责存储、校验与变更通知，页面由插件提供。偏好（上次选择等）不属于配置。
 */
export interface ConfigContract<T extends Json = Json> {
  readonly plugin: string;
  readonly schema: z.ZodType<T>;
  readonly defaults: T;
}
export function defineConfig<T extends Json>(plugin: string, schema: z.ZodType<T>, defaults: NoInfer<T>): ConfigContract<T> {
  const parsed = schema.safeParse(structuredClone(defaults));
  if (!parsed.success) throw new Error(`Configuration defaults of ${plugin} do not match the schema.`);
  return Object.freeze({ plugin, schema, defaults: structuredClone(defaults) });
}
/** 按契约解码保存值；无效或缺失时回退默认值，状态交由调用方展示。 */
export function readConfig<T extends Json>(contract: ConfigContract<T>, raw: unknown): { value: T; status: "saved" | "defaults" | "invalid" } {
  if (raw === undefined || raw === null) return { value: structuredClone(contract.defaults), status: "defaults" };
  const parsed = contract.schema.safeParse(raw);
  return parsed.success ? { value: parsed.data, status: "saved" } : { value: structuredClone(contract.defaults), status: "invalid" };
}
