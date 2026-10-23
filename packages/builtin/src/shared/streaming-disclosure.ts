export interface StreamingPreferences { autoExpand: boolean; autoCollapse: boolean }
export type StreamingStage = "thinking" | "input" | "output" | null;
export interface StreamingDisclosure {
  stage: StreamingStage;
  previewSeen: boolean;
  open: boolean;
  manual: boolean;
  expandAt: number | null;
}

export function initialStreamingDisclosure(): StreamingDisclosure {
  return { stage: null, previewSeen: false, open: false, manual: false, expandAt: null };
}

/** 阶段首段正文开始一次性等待；增量沿用起点，手动选择与关闭偏好取消待展开。 */
export function advanceStreamingDisclosure(
  state: StreamingDisclosure, stage: StreamingStage, hasContent: boolean,
  preferences: StreamingPreferences, now: number,
): StreamingDisclosure {
  let next = state;
  if (state.stage !== stage) {
    next = { stage, previewSeen: false, manual: false, expandAt: null,
      open: state.previewSeen && preferences.autoCollapse ? false : state.open };
  }
  if (stage === null) return next;
  if (hasContent && !next.previewSeen) {
    next = { ...next, previewSeen: true,
      expandAt: preferences.autoExpand && !next.manual && !next.open ? now + 1000 : null };
  }
  if (next.expandAt !== null) {
    if (!preferences.autoExpand) return { ...next, expandAt: null };
    if (now >= next.expandAt) return { ...next, open: true, expandAt: null };
  }
  return next;
}

export function changeStreamingDisclosure(state: StreamingDisclosure, open: boolean): StreamingDisclosure {
  return { ...state, open, manual: true, expandAt: null };
}
