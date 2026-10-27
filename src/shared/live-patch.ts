import type { LiveBlock } from "./session.ts";

/**
 * Incremental streaming-text patches: align previous and next live lists by block ID and compare JSON paths within blocks.
 * Send tails for string appends and new elements for array growth, compare object keys, and replace other changes at the deepest changed position.
 * Unchanged blocks and fields do not appear in patches.
 */
export type LivePath = readonly (string | number)[];
export type LiveOperation =
  | { path: LivePath; append: string }
  | { path: LivePath; set: unknown }
  | { path: LivePath; delete: true };
export type LiveBlockPatch =
  | { id: string; kind: "put"; block: LiveBlock }
  | { id: string; kind: "update"; ops: LiveOperation[] };
export interface LivePatch {
  /** Current order of all block IDs; remove old blocks absent from this list. */
  order: string[];
  changes: LiveBlockPatch[];
}

type Record = { [key: string]: unknown };
const isRecord = (value: unknown): value is Record => typeof value === "object" && value !== null && !Array.isArray(value);

function diffValue(previous: unknown, next: unknown, path: (string | number)[], ops: LiveOperation[]): void {
  if (previous === next) return;
  if (typeof previous === "string" && typeof next === "string") {
    if (next.length > previous.length && next.startsWith(previous)) ops.push({ path: [...path], append: next.slice(previous.length) });
    else ops.push({ path: [...path], set: next });
    return;
  }
  if (Array.isArray(previous) && Array.isArray(next)) {
    if (next.length < previous.length) { ops.push({ path: [...path], set: next }); return; }
    for (let index = 0; index < next.length; index++) {
      path.push(index);
      if (index < previous.length) diffValue(previous[index], next[index], path, ops);
      else ops.push({ path: [...path], set: next[index] });
      path.pop();
    }
    return;
  }
  if (isRecord(previous) && isRecord(next)) {
    for (const [key, value] of Object.entries(next)) {
      path.push(key);
      if (key in previous) diffValue(previous[key], value, path, ops);
      else ops.push({ path: [...path], set: value });
      path.pop();
    }
    for (const key of Object.keys(previous)) if (!(key in next)) ops.push({ path: [...path, key], delete: true });
    return;
  }
  ops.push({ path: [...path], set: next });
}

/** Compute patches from previous to next; return null without changes. */
export function diffLive(previous: readonly LiveBlock[], next: readonly LiveBlock[]): LivePatch | null {
  const before = new Map(previous.map(block => [block.id, block]));
  const changes: LiveBlockPatch[] = [];
  for (const block of next) {
    const old = before.get(block.id);
    if (!old || old.kind !== block.kind) { changes.push({ id: block.id, kind: "put", block }); continue; }
    const ops: LiveOperation[] = [];
    diffValue(old, block, [], ops);
    if (ops.length) changes.push({ id: block.id, kind: "update", ops });
  }
  const order = next.map(block => block.id);
  const sameOrder = order.length === previous.length && order.every((id, index) => previous[index]!.id === id);
  return changes.length || !sameOrder ? { order, changes } : null;
}

/** Copy containers along the write path; values outside the path retain object identity. */
function applyOperation(target: unknown, operation: LiveOperation, depth = 0): unknown {
  const { path } = operation;
  if (depth === path.length) {
    if ("append" in operation) {
      if (typeof target !== "string") throw new Error("A live update appended to a non-string value.");
      return target + operation.append;
    }
    if ("set" in operation) return operation.set;
    throw new Error("A live update deleted the block root.");
  }
  const key = path[depth]!;
  if (Array.isArray(target)) {
    if (typeof key !== "number") throw new Error("A live update addressed an array with a key.");
    const copy = target.slice();
    if (depth === path.length - 1 && "delete" in operation) copy.splice(key, 1);
    else copy[key] = applyOperation(target[key], operation, depth + 1);
    return copy;
  }
  if (!isRecord(target)) throw new Error("A live update addressed a missing container.");
  const copy: Record = { ...target };
  if (depth === path.length - 1 && "delete" in operation) delete copy[key];
  else copy[key] = applyOperation(target[key], operation, depth + 1);
  return copy;
}

/** Apply patches, preserving unchanged block/field identity so views can skip rerendering by reference. */
export function applyLive(previous: readonly LiveBlock[], patch: LivePatch): LiveBlock[] {
  const blocks = new Map(previous.map(block => [block.id, block]));
  for (const change of patch.changes) {
    if (change.kind === "put") { blocks.set(change.id, change.block); continue; }
    const old = blocks.get(change.id);
    if (!old) throw new Error("A live update referenced an unknown block.");
    blocks.set(change.id, change.ops.reduce<unknown>((value, operation) => applyOperation(value, operation), old) as LiveBlock);
  }
  return patch.order.map(id => {
    const block = blocks.get(id);
    if (!block) throw new Error("A live update referenced an unknown block.");
    return block;
  });
}
