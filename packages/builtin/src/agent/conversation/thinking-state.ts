
type Preferences = { thinkingAutoExpand: boolean; thinkingAutoCollapse: boolean };
export interface ThinkingDisclosure { streaming: boolean; open: boolean }

export function initialThinkingDisclosure(streaming: boolean, preferences: Preferences): ThinkingDisclosure {
  return { streaming, open: streaming && preferences.thinkingAutoExpand };
}

/** 自动规则只作用于阶段切换；增量和偏好更新不覆盖当前块的手动选择。 */
export function advanceThinkingDisclosure(state: ThinkingDisclosure, streaming: boolean, preferences: Preferences): ThinkingDisclosure {
  if (state.streaming === streaming) return state;
  return { streaming, open: streaming ? preferences.thinkingAutoExpand : preferences.thinkingAutoCollapse ? false : state.open };
}

export function thinkingDuration(startedAt: number | null, endedAt: number): string | null {
  if (startedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  const seconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
