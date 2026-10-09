import type { Point, WorkbenchSnapshot } from "../../../shared/workbench";
import { fallbackCardWidth, placementCardHeight } from "./layout";

export type ConnectionSide = "left" | "right" | "top" | "bottom";
export type ConnectionPort = { id: string; side: ConnectionSide; offset: number };
const sides: ConnectionSide[] = ["left", "right", "top", "bottom"];
export const defaultConnectionPorts: ConnectionPort[] = sides.map(side => ({ id: side, side, offset: 0.5 }));

type LayoutNode = { id: string; position: Point; measured?: { width?: number; height?: number } };
type Endpoint = { id: string; order: number };
type ConnectionEdge = { id: string; source: string; target: string; sourceHandle: string; targetHandle: string };

/** 端点是布局投影：四边按对方位置选择，同边按对方坐标排序并分散，不改变链接方向。 */
export function layoutConnections(nodes: readonly LayoutNode[], links: WorkbenchSnapshot["links"]) {
  const geometry = new Map(nodes.map(node => {
    const width = node.measured?.width ?? fallbackCardWidth;
    const height = node.measured?.height ?? placementCardHeight;
    return [node.id, { x: node.position.x + width / 2, y: node.position.y + height / 2, width, height }];
  }));
  const groups = new Map(nodes.map(node => [node.id, {
    left: [] as Endpoint[], right: [] as Endpoint[], top: [] as Endpoint[], bottom: [] as Endpoint[],
  }]));
  const edges: ConnectionEdge[] = [];
  for (const link of links) {
    const source = geometry.get(link.resourceId);
    const target = geometry.get(link.agentId);
    // 隐藏对象的关系仍在快照中；画布只投影两端都可见的连线。
    if (!source || !target) continue;
    const id = `${link.agentId}:${link.resourceId}`;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const horizontal = Math.abs(dx) / (source.width + target.width) >= Math.abs(dy) / (source.height + target.height);
    const sourceSide = horizontal ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
    const targetSide = horizontal ? (dx >= 0 ? "left" : "right") : (dy >= 0 ? "top" : "bottom");
    groups.get(link.resourceId)![sourceSide].push({ id, order: horizontal ? target.y : target.x });
    groups.get(link.agentId)![targetSide].push({ id, order: horizontal ? source.y : source.x });
    edges.push({ id, source: link.resourceId, target: link.agentId, sourceHandle: id, targetHandle: id });
  }
  const ports = new Map<string, ConnectionPort[]>();
  for (const [nodeId, group] of groups) {
    ports.set(nodeId, sides.flatMap(side => {
      const endpoints = group[side].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      // 无连线的一边也保留一个入口；有连线时每条线获得独立端点，均可继续拖线。
      return endpoints.length
        ? endpoints.map((endpoint, index) => ({ id: endpoint.id, side, offset: (index + 1) / (endpoints.length + 1) }))
        : [{ id: side, side, offset: 0.5 }];
    }));
  }
  return { edges, ports };
}
