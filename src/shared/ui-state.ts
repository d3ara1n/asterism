import { z } from "zod";

/**
 * 界面状态：应用顺手记下、不出现在设置页的零碎持久化状态（窗口尺寸、侧栏宽度、「不再提示」等）。
 * 每个键在此登记 schema 与默认值；读出时按键校验，单项损坏只回退该项。schema 变更不做迁移，回退默认即可。
 * 任务相关的视口与卡片位置属于任务视图事件，不放这里；用户可见可改的偏好属于设置，也不放这里。
 */
export const uiStateSchemas = {
  /** 主窗口常规尺寸、位置与最大化标记；仅主进程使用。 */
  window: z.object({
    x: z.number().int(), y: z.number().int(),
    width: z.number().int().positive(), height: z.number().int().positive(),
    maximized: z.boolean(),
  }).nullable(),
} satisfies Record<string, z.ZodType>;

export type UiStateKey = keyof typeof uiStateSchemas;
export type UiState = { [K in UiStateKey]: z.infer<(typeof uiStateSchemas)[K]> };

export const uiStateDefaults: UiState = {
  window: null,
};

export function parseUiState<K extends UiStateKey>(key: K, raw: unknown): UiState[K] {
  const result = uiStateSchemas[key].safeParse(raw);
  return (result.success ? result.data : uiStateDefaults[key]) as UiState[K];
}
