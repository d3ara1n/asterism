import type { SessionView } from "@asterism-app/sdk/contracts";
import { AgentInputMessage, executionRecordIds } from "@asterism-app/builtin-api/contracts";

/**
 * Input messages first delivered to a model by the next request: those after `mark`, or, without a mark, after this Agent's latest
 * execution record. Returns the text of user messages among them and the new mark. Agent and event messages advance the mark
 * without contributing text.
 */
export function newUserInput(view: SessionView, agentId: string, mark: number | undefined): { texts: string[]; mark: number } {
  const after = mark ?? view.records.index({ scope: "timeline", contracts: executionRecordIds, source: agentId, edge: "last", limit: 1 })[0]?.sequence ?? 0;
  const texts: string[] = [];
  let next = after;
  let before: string | undefined;
  for (;;) {
    const page = view.records.query(AgentInputMessage, { scope: "timeline", source: agentId, edge: "last", limit: 32, before });
    const fresh = page.filter(input => input.record.sequence > after);
    for (const input of fresh.toReversed()) {
      next = Math.max(next, input.record.sequence);
      if (input.status === "known" && input.data.sender.kind === "user")
        texts.unshift(...input.data.parts.flatMap(part => part.kind === "text" ? [part.text] : []));
    }
    if (fresh.length < page.length || page.length < 32) return { texts, mark: next };
    before = page[0]!.record.id;
  }
}
