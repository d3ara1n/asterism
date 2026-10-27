import type { SessionNode } from "../../../shared/session";

export type HistoryBranch = {
  id: string;
  number: number;
  parentId: string | null;
  /** The shared start references the same historical node; null denotes the session start. */
  forkId: string | null;
  nodeIds: Set<string>;
  tip: string | null;
};
export type HistoryBranches = {
  branches: HistoryBranch[];
  owner: Map<string, HistoryBranch>;
};

/**
 * A branch represents a complete root-to-leaf timeline; its Tab stores only the shared start and unique continuation, with the parent branch carrying the common prefix.
 * When the execution cursor is in the common prefix, Tab ownership is only a display choice and does not determine the current timeline.
 * The first descendant continues the original branch; sibling descendants appended later open separate Tabs.
 * Identity comes from the first node, and numbering from append order; cursor changes and further appends do not rename branches.
 * All records participate in the tree structure and can become display rows and navigation targets.
 */
export function historyBranches(nodes: readonly SessionNode[]): HistoryBranches {
  const main: HistoryBranch = { id: "main", number: 0, parentId: null, forkId: null, nodeIds: new Set(), tip: null };
  const branches = [main];
  const owner = new Map<string, HistoryBranch>();
  const extended = new Set<string | null>();
  for (const node of nodes) {
    const parent = node.parentId === null ? main : owner.get(node.parentId) ?? main;
    let branch = parent;
    if (extended.has(node.parentId)) {
      const forkId = node.parentId;
      branch = { id: `branch:${node.id}`, number: branches.length, parentId: parent.id, forkId,
        nodeIds: new Set(forkId === null ? [] : [forkId]), tip: forkId };
      branches.push(branch);
    }
    extended.add(node.parentId);
    owner.set(node.id, branch);
    branch.nodeIds.add(node.id);
    branch.tip = node.id;
  }
  return { branches, owner };
}

export function branchContains(branch: HistoryBranch, nodeId: string | null): boolean {
  return nodeId === null ? branch.forkId === null : branch.nodeIds.has(nodeId);
}

/** A shared start can belong to two Tabs; explicit selection takes priority, while external navigation uses the node's owning branch. */
export function branchForNode(tree: HistoryBranches, nodeId: string | null, preferredId?: string | null): HistoryBranch {
  const preferred = tree.branches.find(branch => branch.id === preferredId);
  if (preferred && branchContains(preferred, nodeId)) return preferred;
  return (nodeId === null ? undefined : tree.owner.get(nodeId)) ?? tree.branches[0]!;
}
