import { SessionError } from "../shared/session-timeline.ts";
import type { SessionNodeInfo } from "../shared/session.ts";

export interface StructuralNode extends Omit<SessionNodeInfo, "sequence"> { readonly seq: number }

/**
 * Committed structure of one session: identity, ancestry, append order, and contract, without record bodies.
 * Rows enter only outside transactions, so rollback cannot leave entries behind; rows above `head` are read from storage.
 */
export class SessionStructure {
  private readonly nodes = new Map<string, StructuralNode>();
  private readonly order: StructuralNode[] = [];
  /** Highest indexed append position; every committed row of this session at or below it is indexed. */
  head = 0;
  // One root-to-tip path reused across reads. Reads are synchronous, so a returned prefix stays valid while it is consumed.
  private readonly spine: StructuralNode[] = [];
  private readonly positions = new Map<string, number>();
  private readonly buckets = new Map<string, number[]>();

  add(node: StructuralNode): void {
    this.nodes.set(node.id, node);
    this.order.push(node);
    this.head = node.seq;
  }
  get(id: string): StructuralNode | undefined { return this.nodes.get(id); }

  /** Position the spine on an indexed node and return the length of its root-to-node prefix. */
  locate(id: string | null): number {
    if (id === null) return 0;
    const known = this.positions.get(id);
    if (known !== undefined) return known + 1;
    const branch: StructuralNode[] = [];
    let current = this.nodes.get(id), base = 0;
    if (!current) throw new SessionError("not_found", "Session node not found.");
    for (;;) {
      branch.push(current);
      if (current.parentId === null) break;
      const at = this.positions.get(current.parentId);
      if (at !== undefined) { base = at + 1; break; }
      const parent = this.nodes.get(current.parentId);
      if (!parent) throw new SessionError("not_found", "Session node not found.");
      if (parent.seq >= current.seq) throw new SessionError("conflict", "Session ancestry is outside its append order.");
      current = parent;
    }
    if (base > 0 && this.spine[base - 1]!.seq >= branch.at(-1)!.seq)
      throw new SessionError("conflict", "Session ancestry is outside its append order.");
    this.truncate(base);
    for (let index = branch.length - 1; index >= 0; index--) this.push(branch[index]!);
    return this.spine.length;
  }
  /** Prefix nodes in root-to-tip order, optionally narrowed by contract indexes. */
  select(length: number, contracts?: readonly string[]): StructuralNode[] {
    if (!contracts) {
      if (!length) return [];
      return this.spine.slice(0, length);
    }
    const lists = [...new Set(contracts)].map(contract => {
      const bucket = this.bucket(contract);
      return { bucket, end: upperBound(bucket, length) };
    });
    const indices = lists.length === 1 ? lists[0]!.bucket.slice(0, lists[0]!.end)
      : lists.flatMap(({ bucket, end }) => bucket.slice(0, end)).sort((a, b) => a - b);
    return indices.map(index => this.spine[index]!);
  }
  /** Indexed session nodes up to an append position, in append order. */
  range(upperSeq: number, contracts?: readonly string[]): StructuralNode[] {
    const end = this.rank(Math.min(upperSeq, this.head));
    const nodes = this.order.slice(0, end);
    return contracts ? nodes.filter(node => contracts.includes(node.contract)) : nodes;
  }
  /** Number of indexed nodes at or before an append position. */
  rank(seq: number): number {
    let low = 0, high = this.order.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.order[middle]!.seq <= seq) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  private bucket(contract: string): number[] {
    let bucket = this.buckets.get(contract);
    if (!bucket) {
      bucket = [];
      for (let index = 0; index < this.spine.length; index++) if (this.spine[index]!.contract === contract) bucket.push(index);
      this.buckets.set(contract, bucket);
    }
    return bucket;
  }
  private truncate(length: number): void {
    for (let index = length; index < this.spine.length; index++) this.positions.delete(this.spine[index]!.id);
    this.spine.length = length;
    for (const bucket of this.buckets.values()) while (bucket.length && bucket.at(-1)! >= length) bucket.pop();
  }
  private push(node: StructuralNode): void {
    this.positions.set(node.id, this.spine.length);
    this.buckets.get(node.contract)?.push(this.spine.length);
    this.spine.push(node);
  }
}

function upperBound(sorted: readonly number[], limit: number): number {
  let low = 0, high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sorted[middle]! < limit) low = middle + 1;
    else high = middle;
  }
  return low;
}
