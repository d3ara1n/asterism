import type { RecordQuery } from "@asterism-app/sdk/contracts";
import type { SessionNode, SessionNodeInfo } from "../shared/session.ts";
import { sessionTimeline } from "../shared/session-timeline.ts";
import { selectNodes } from "./query.ts";

/** Query ranges and contract filters; omitted edge returns all matching nodes. */
export type NodeQuery = RecordQuery;
export interface SequencedNode { node: SessionNode; sequence: number }
/** Fixed-position node read handle; consumers own domain decoding. */
export interface NodeView {
  readonly id: string;
  readonly title: string;
  readonly nodeId: string | null;
  read(query: NodeQuery): SequencedNode[];
  index(query: NodeQuery): readonly SessionNodeInfo[];
  timelineIds(): readonly string[];
}

/** In-memory record sets construct fixed observation handles for pure projections. */
export function nodeView(id: string, title: string, nodes: readonly SessionNode[], nodeId: string | null): NodeView {
  const length = nodes.length;
  const fixedNodes = () => nodes.length === length ? nodes : nodes.slice(0, length);
  const select = (query: NodeQuery) => {
    const fixed = fixedNodes();
    return selectNodes(query.scope === "session" ? fixed : sessionTimeline(fixed, nodeId), query);
  };
  const sequence = new Map(nodes.map((node, index) => [node.id, index + 1]));
  return { id, title, nodeId,
    timelineIds: () => sessionTimeline(fixedNodes(), nodeId).map(node => node.id),
    index: query => select(query).map(node => nodeInfo(node, sequence.get(node.id)!)),
    read(query) {
      return select(query).map(node => ({ node, sequence: sequence.get(node.id)! }));
    },
  };
}

export function nodeInfo(node: SessionNode, sequence: number): SessionNodeInfo {
  const { data: _data, model: _model, recipient: _recipient, ...info } = node;
  return { ...info, sequence };
}
