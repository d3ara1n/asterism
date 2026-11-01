import type { RecordQuery, RecordRef } from "@asterism-app/sdk/contracts";
import type { SessionNode } from "../shared/session.ts";
import { SessionError } from "../shared/session-timeline.ts";

/** Typed queries intersect their contract with the caller's selection; edge lookups select exactly one record. */
export function contractQuery(query: RecordQuery, contract: RecordRef, edge?: "first" | "last"): RecordQuery {
  return { ...query, contracts: !query.contracts || query.contracts.includes(contract.id) ? [contract.id] : [],
    ...(edge ? { edge, limit: 1 } : {}) };
}

/** Positions delimit the unfiltered scope; filters and edge limits apply within that interval. */
export function selectNodes<T extends Pick<SessionNode, "id" | "contract" | "source">>(nodes: readonly T[], query: RecordQuery): T[] {
  const start = query.from === undefined ? 0 : nodes.findIndex(node => node.id === query.from);
  const end = query.before === undefined ? nodes.length : nodes.findIndex(node => node.id === query.before);
  if (start < 0 || end < 0 || start > end) throw new SessionError("invalid_argument", "The record range is outside the selected scope.");
  if (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit <= 0))
    throw new SessionError("invalid_argument", "The record limit must be a positive integer.");
  const limit = query.limit ?? (query.edge ? 1 : Infinity);
  const backwards = query.edge === "last", ids = query.ids ? new Set(query.ids) : null;
  const result: T[] = [];
  for (let index = backwards ? end - 1 : start; backwards ? index >= start : index < end; index += backwards ? -1 : 1) {
    const node = nodes[index]!;
    if (ids && !ids.has(node.id)) continue;
    if (query.contracts && !query.contracts.includes(node.contract)) continue;
    if (query.source !== undefined && (node.source?.resource?.id ?? null) !== query.source) continue;
    result.push(node);
    if (result.length === limit) break;
  }
  return backwards ? result.reverse() : result;
}
