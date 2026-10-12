import { z } from "zod";
import { jsonSchema } from "@atelier/sdk/contracts";
import { coreChannel } from "./core.ts";

/**
 * 界面状态：应用顺手记下、不出现在设置页的零碎持久化状态（窗口尺寸、侧栏宽度、「不再提示」等）。
 * 每个键在此登记 schema 与默认值；读出时按键校验，单项损坏只回退该项。schema 变更不做迁移，回退默认即可。
 * 任务相关的视口与卡片位置属于任务视图事件，不放这里；用户可见可改的偏好属于设置，也不放这里。
 */
/** 偏好键只允许宿主规定的两个前缀，renderer 不能写入其他界面状态。 */
export const preferenceKeySchema = z.string().min(1).max(512).regex(/^(?:creation-route|plugin)\/[\x21-\x7e]+$/u);
export const preferencesGetChannel = coreChannel("preferences:get");
export const preferencesSetChannel = coreChannel("preferences:set");
export const preferenceWriteSchema = z.strictObject({ key: preferenceKeySchema, value: jsonSchema.nullable() });

export const uiStateSchemas = {
  /** 主窗口常规尺寸、位置与最大化标记；仅主进程使用。 */
  window: z.object({
    x: z.number().int(), y: z.number().int(),
    width: z.number().int().positive(), height: z.number().int().positive(),
    maximized: z.boolean(),
  }).nullable(),
  /**
   * 受控偏好容器：宿主路由记忆（`creation-route/...`）与按插件隔离的偏好（`plugin/<pluginId>/...`）。
   * 键由宿主生成，值为 JSON；单键语义由读取方按自己的 schema 校验，失效即回退并可清理。
   */
  preferences: z.record(preferenceKeySchema, jsonSchema),
} satisfies Record<string, z.ZodType>;

export type UiStateKey = keyof typeof uiStateSchemas;
export type UiState = { [K in UiStateKey]: z.infer<(typeof uiStateSchemas)[K]> };

export const uiStateDefaults: UiState = {
  window: null,
  preferences: {},
};

export function parseUiState<K extends UiStateKey>(key: K, raw: unknown): UiState[K] {
  const result = uiStateSchemas[key].safeParse(raw);
  return (result.success ? result.data : uiStateDefaults[key]) as UiState[K];
}
