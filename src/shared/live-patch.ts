import type { LiveBlock } from "./session.ts";

/**
 * 流式正文的增量补丁：前后两份 live 列表按块 ID 对齐，块内按 JSON 路径比较。
 * 字符串只追加时发送尾部，数组增长时只发送新元素，对象按键比较；其余变化在最深的变化位置整值替换。
 * 未变化的块与字段不出现在补丁中。
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
  /** 当前全部块 ID 的顺序；不在其中的旧块被移除。 */
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

/** 计算 previous 到 next 的补丁；没有任何变化时返回 null。 */
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

/** 沿路径复制容器写入；路径之外的值保持对象身份。 */
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

/** 应用补丁；未变化的块与字段保持对象身份，供界面按引用跳过重渲染。 */
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
