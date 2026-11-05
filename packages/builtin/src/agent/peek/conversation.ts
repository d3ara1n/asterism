import type { PeekClient, PeekExchange, PeekOutcome, PeekResult } from "@asterism-app/builtin-api/contracts";

export interface PeekTurn {
  question: string;
  progress: PeekResult | null;
  result: PeekOutcome | null;
}
interface PeekConversationState {
  turns: readonly PeekTurn[];
  draft: string;
  pending: boolean;
}

/** Temporary question/report history belongs to this view, not the target Agent or the investigation's retrieval loop. */
export function createPeekConversation() {
  let state: PeekConversationState = { turns: [], draft: "", pending: false };
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const update = (next: PeekConversationState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const updateTurn = (turn: PeekTurn) => update({ ...state, turns: [...state.turns.slice(0, -1), turn] });
  const submit = async (client: PeekClient, question: string): Promise<boolean> => {
    question = question.trim();
    if (state.pending || !question) return false;
    const history: PeekExchange[] = state.turns.map(turn => ({
      question: turn.question,
      report: (turn.result?.data ?? turn.progress)?.report ?? "",
      outcome: turn.result!.kind,
    }));
    const request = new AbortController();
    controller = request;
    let turn: PeekTurn = { question, progress: null, result: null };
    update({ turns: [...state.turns, turn], draft: "", pending: true });
    try {
      const result = await client.run({ question, history }, { signal: request.signal, onProgress: progress => {
        turn = { ...turn, progress };
        updateTurn(turn);
      } });
      turn = { ...turn, result };
    } catch (error) {
      turn = { ...turn, result: request.signal.aborted
        ? { kind: "cancelled", message: "The investigation was cancelled.", ...(turn.progress ? { data: turn.progress } : {}) }
        : { kind: "failed", ...(turn.progress ? { data: turn.progress } : {}),
          error: { code: "peek_failed", message: error instanceof Error ? error.message : String(error) } } };
    } finally {
      controller = null;
      update({ ...state, turns: [...state.turns.slice(0, -1), turn], pending: false });
    }
    return true;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setDraft(draft: string) { update({ ...state, draft }); },
    submit,
    stop() { controller?.abort(); },
  };
}
export type PeekConversation = ReturnType<typeof createPeekConversation>;
