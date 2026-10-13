import type { SessionNode } from "../shared/session.ts";
import { sessionTimeline } from "../shared/session-timeline.ts";

/** 查询范围与契约筛选；省略 edge 时返回全部匹配节点。 */
export interface NodeQuery {
  scope: "timeline" | "session";
  contracts?: readonly string[];
  edge?: "first" | "last";
}
export interface SequencedNode { node: SessionNode; sequence: number }
/** 固定位置的节点读取柄；领域解码由消费方负责。 */
export interface NodeView {
  readonly id: string;
  readonly title: string;
  readonly nodeId: string | null;
  read(query: NodeQuery): SequencedNode[];
  timelineIds(): readonly string[];
}

/** 已交付的不可变节点集合（前端与纯投影）也按需构造公开记录。 */
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
