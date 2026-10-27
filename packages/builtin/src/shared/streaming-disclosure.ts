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
 * The stage's first body text starts a one-time wait; deltas retain that start, while manual choices and disabling the preference cancel pending expansion.
 * Content requiring user action expands immediately once when it first appears in the stage, regardless of preferences and earlier manual choices;
 * disclosure state is retained when that stage ends, so the result appears in place.
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
