export interface StreamingPreferences { autoExpand: boolean; autoCollapse: boolean }
export interface StreamingDisclosure { streaming: boolean; open: boolean }

export function initialStreamingDisclosure(streaming: boolean, preferences: StreamingPreferences): StreamingDisclosure {
  return { streaming, open: streaming && preferences.autoExpand };
}

/** 每个预览阶段只在开始和结束时应用偏好，增量与设置更新保留手动选择。 */
export function advanceStreamingDisclosure<T extends StreamingDisclosure>(
  state: T, streaming: boolean, preferences: StreamingPreferences,
): T {
  if (state.streaming === streaming) return state;
  return { ...state, streaming, open: streaming
    ? preferences.autoExpand || state.open
    : preferences.autoCollapse ? false : state.open };
}
