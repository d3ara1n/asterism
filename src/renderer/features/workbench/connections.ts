import type { Point, WorkbenchSnapshot } from "../../../shared/workbench";
import { fallbackCardWidth, fallbackCardHeight } from "./layout";

export type ConnectionSide = "left" | "right" | "top" | "bottom";
export type ConnectionPort = { id: string; side: ConnectionSide; offset: number };
const sides: ConnectionSide[] = ["left", "right", "top", "bottom"];
export const defaultConnectionPorts: ConnectionPort[] = sides.map(side => ({ id: side, side, offset: 0.5 }));

type LayoutNode = { id: string; position: Point; measured?: { width?: number; height?: number } };
type Endpoint = { id: string; order: number };
export type ConnectionEdge = {
  id: string; source: string; target: string; sourceHandle: string; targetHandle: string;
  data: { links: WorkbenchSnapshot["links"] };
};

/** Endpoints are a layout projection: choose among four sides by the other object's position, then sort and distribute on each side by the other object's coordinates, without changing link direction. */
export function layoutConnections(nodes: readonly LayoutNode[], links: WorkbenchSnapshot["links"]) {
  const geometry = new Map(nodes.map(node => {
    const width = node.measured?.width ?? fallbackCardWidth;
    const height = node.measured?.height ?? fallbackCardHeight;
    return [node.id, { x: node.position.x + width / 2, y: node.position.y + height / 2, width, height }];
  }));
  const groups = new Map(nodes.map(node => [node.id, {
    left: [] as Endpoint[], right: [] as Endpoint[], top: [] as Endpoint[], bottom: [] as Endpoint[],
  }]));
  const pairs = new Map<string, ConnectionEdge>();
  for (const link of links) {
    if (!geometry.has(link.resourceId) || !geometry.has(link.receiverId)) continue;
    // Display identity depends only on the object pair; adding or removing the reverse relationship preserves connection selection and endpoint identities.
    const id = [link.receiverId, link.resourceId].sort().map(encodeURIComponent).join(":");
    const existing = pairs.get(id);
    if (existing) existing.data.links.push(link);
    else pairs.set(id, { id, source: link.resourceId, target: link.receiverId, sourceHandle: id, targetHandle: id, data: { links: [link] } });
  }
  const edges = [...pairs.values()];
  for (const edge of edges) {
    const { id } = edge;
    const source = geometry.get(edge.source)!;
    const target = geometry.get(edge.target)!;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const horizontal = Math.abs(dx) / (source.width + target.width) >= Math.abs(dy) / (source.height + target.height);
    const sourceSide = horizontal ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
    const targetSide = horizontal ? (dx >= 0 ? "left" : "right") : (dy >= 0 ? "top" : "bottom");
    groups.get(edge.source)![sourceSide].push({ id, order: horizontal ? target.y : target.x });
    groups.get(edge.target)![targetSide].push({ id, order: horizontal ? source.y : source.x });
  }
  const ports = new Map<string, ConnectionPort[]>();
  for (const [nodeId, group] of groups) {
    ports.set(nodeId, sides.flatMap(side => {
      const endpoints = group[side].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      // A side without connections still retains one entry point; with connections, each gets its own endpoint, and all remain available for dragging new connections.
      return endpoints.length
        ? endpoints.map((endpoint, index) => ({ id: endpoint.id, side, offset: (index + 1) / (endpoints.length + 1) }))
        : [{ id: side, side, offset: 0.5 }];
    }));
  }
  return { edges, ports };
}

/** Compare endpoints individually by identity, side, and offset; reuse unchanged node data identities after layout recalculation. */
export function samePorts(a: readonly ConnectionPort[] | undefined, b: readonly ConnectionPort[] | undefined) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((port, index) => port.id === b[index]!.id && port.side === b[index]!.side && port.offset === b[index]!.offset);
}
