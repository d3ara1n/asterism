export interface StreamingPreferences { autoExpand: boolean; autoCollapse: boolean }
export type StreamingStage = "thinking" | "input" | "output" | null;
export interface StreamingDisclosure {
  stage: StreamingStage;
  previewSeen: boolean;
  attentionSeen: boolean;
  open: boolean;
  manual: boolean;
  expandAt: number | null;
}

export function initialStreamingDisclosure(): StreamingDisclosure {
  return { stage: null, previewSeen: false, attentionSeen: false, open: false, manual: false, expandAt: null };
}

/**
 * 阶段首段正文开始一次性等待；增量沿用起点，手动选择与关闭偏好取消待展开。
 * 需要用户处理的正文在阶段内首次出现时立即展开一次，不受偏好与此前手动选择影响；
 * 该阶段结束时保持开合，让处理结果在原位呈现。
 */
export function advanceStreamingDisclosure(
  state: StreamingDisclosure, stage: StreamingStage, hasContent: boolean,
  preferences: StreamingPreferences, now: number, attention = false,
): StreamingDisclosure {
  let next = state;
  if (state.stage !== stage) {
    next = { stage, previewSeen: false, attentionSeen: false, manual: false, expandAt: null,
      open: state.previewSeen && !state.attentionSeen && preferences.autoCollapse ? false : state.open };
  }
  if (stage === null) return next;
  if (attention && !next.attentionSeen) {
    next = { ...next, attentionSeen: true, open: true, expandAt: null };
  }
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
