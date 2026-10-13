import type { SessionNode } from "../../../shared/session";

export type HistoryBranch = {
  id: string;
  number: number;
  parentId: string | null;
  /** 共享起点是同一历史节点的引用；null 表示会话起点。 */
  forkId: string | null;
  nodeIds: Set<string>;
  tip: string | null;
};
export type HistoryBranches = {
  branches: HistoryBranch[];
  owner: Map<string, HistoryBranch>;
};

/**
 * 第一个后代延续原分支，之后追加的兄弟后代另开 Tab。
 * 身份来自首节点，编号来自追加顺序；游标变化、继续追加都不重命名分支。
 * 所有记录都参与树结构，也可成为展示行与跳转目标。
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

/** 共享起点可同时属于两个 Tab；显式选择优先，外部定位则落到节点所属分支。 */
export function viewedBranch(tree: HistoryBranches, at: string | null, preferredId?: string | null): HistoryBranch {
  const preferred = tree.branches.find(branch => branch.id === preferredId);
  if (preferred && branchContains(preferred, at)) return preferred;
  return (at === null ? undefined : tree.owner.get(at)) ?? tree.branches[0]!;
}

export type BranchNavigation = { branchId: string; nodeId: string | null; version: number };

/** 只接受成功发布且未被之后导航取代的跳转；失败时保留原 Tab。 */
export function arrivedBranch(
  pending: BranchNavigation | null, state: { status: string; navigationVersion: number; snapshot: { at: string | null } | null },
): string | null {
  return pending && state.status === "ready" && state.navigationVersion === pending.version && state.snapshot?.at === pending.nodeId
    ? pending.branchId : null;
}
