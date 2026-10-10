import { describe, expect, it } from "vitest";
import { layoutConnections } from "./connections";

const nodes = [
  { id: "a", position: { x: 0, y: 0 } },
  { id: "b", position: { x: 800, y: 0 } },
  { id: "c", position: { x: 800, y: 500 } },
];
const forward = { resourceId: "a", agentId: "b" };
const reverse = { resourceId: "b", agentId: "a" };

describe("双向连线投影", () => {
  it("反向链接合并为一条线，保留整条删除所需的两个方向", () => {
    const links = [forward, reverse];
    const { edges, ports } = layoutConnections(nodes, links);
    expect(edges).toHaveLength(1);
    const edge = edges[0]!;
    expect(edge.data.links).toEqual([forward, reverse]);
    for (const id of ["a", "b"]) {
      expect(ports.get(id)!.filter(port => port.id === edge.id)).toHaveLength(1);
    }
    expect(links).toEqual([forward, reverse]);
  });

  it("增加或解除任一方向、重排输入时保留连线身份，单向仍指向接收代理", () => {
    const single = layoutConnections(nodes, [forward]).edges[0]!;
    const mutual = layoutConnections(nodes, [forward, reverse]).edges[0]!;
    const reordered = layoutConnections(nodes, [reverse, forward]).edges[0]!;
    const remaining = layoutConnections(nodes, [reverse]).edges[0]!;
    expect(mutual.id).toBe(single.id);
    expect(reordered.id).toBe(single.id);
    expect(remaining.id).toBe(single.id);
    expect(single).toMatchObject({ source: "a", target: "b", data: { links: [forward] } });
    expect(remaining).toMatchObject({ source: "b", target: "a", data: { links: [reverse] } });
  });

  it("只合并同一对象对，隐藏端点时收起整条关系线", () => {
    const other = { resourceId: "a", agentId: "c" };
    const links = [forward, reverse, other];
    const visible = layoutConnections(nodes, links);
    expect(visible.edges).toHaveLength(2);
    expect(visible.edges.flatMap(edge => edge.data.links)).toEqual(links);
    const hidden = layoutConnections(nodes.filter(node => node.id !== "b"), links);
    expect(hidden.edges).toHaveLength(1);
    expect(hidden.edges[0]!.data.links).toEqual([other]);
  });
});
