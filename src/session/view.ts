import type { SessionNode } from "../shared/session.ts";
import { sessionTimeline } from "../shared/session-timeline.ts";

/** Query ranges and contract filters; omitted edge returns all matching nodes. */
export interface NodeQuery {
  scope: "timeline" | "session";
  contracts?: readonly string[];
  edge?: "first" | "last";
}
export interface SequencedNode { node: SessionNode; sequence: number }
/** Fixed-position node read handle; consumers own domain decoding. */
export interface NodeView {
  readonly id: string;
  readonly title: string;
  readonly nodeId: string | null;
  read(query: NodeQuery): SequencedNode[];
  timelineIds(): readonly string[];
}

/** Already-delivered immutable node sets in frontends and pure projections also construct public records on demand. */
export function nodeView(id: string, title: string, nodes: readonly SessionNode[], nodeId: string | null): NodeView {
  const length = nodes.length;
  const fixedNodes = () => nodes.length === length ? nodes : nodes.slice(0, length);
  return { id, title, nodeId,
    timelineIds: () => sessionTimeline(fixedNodes(), nodeId).map(node => node.id),
    read(query) {
      const fixed = fixedNodes();
      const candidates = query.scope === "session" ? fixed : sessionTimeline(fixed, nodeId);
      const matches = (node: SessionNode) => !query.contracts || query.contracts.includes(node.contract);
      let selected: readonly SessionNode[];
      if (query.edge) {
        const node = query.edge === "first" ? candidates.find(matches) : candidates.findLast(matches);
        selected = node ? [node] : [];
      } else selected = candidates.filter(matches);
      if (!selected.length) return [];
      const sequence = new Map(fixed.map((node, index) => [node.id, index + 1]));
      return selected.map(node => ({ node, sequence: sequence.get(node.id)! }));
    },
  };
}
