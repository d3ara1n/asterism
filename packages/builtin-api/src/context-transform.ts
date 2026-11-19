import type { ModelItem, SessionDirectory } from "@asterism-app/sdk/contracts";
import { defineModule, PluginApiError, type PluginContext } from "@asterism-app/sdk/runtime";

/** Provenance accompanies the projection; it is not model content or a writable timeline address. */
export interface AgentContextItem {
  readonly item: ModelItem;
  readonly origin?: {
    readonly recordId: string;
    /** Original part index for each current part, or null for a synthetic or replaced part. */
    readonly parts: readonly (number | null)[];
  };
}
export interface AgentContextUnit {
  /** Append sequence of the turn's starting record; zero before the first recorded turn. */
  readonly turn: number;
  /** Tool calls and their results travel together in one unit. */
  readonly items: readonly AgentContextItem[];
}
export interface AgentContextRequest {
  readonly sessionId: string;
  readonly agentId: string;
  /** Starting sequence of the current turn, or a proposed boundary during admission. */
  readonly turn: number;
}
interface Transform {
  id: string;
  transform(projection: readonly AgentContextUnit[], request: AgentContextRequest): readonly AgentContextUnit[];
}
const directories = new WeakMap<SessionDirectory, Map<string, Transform["transform"]>>();

/** Each synchronous stage receives the preceding stage's projection in registration order. */
export function defineAgentContextTransform({ id, transform }: Transform) {
  return defineModule(plugin => {
    let entries = directories.get(plugin.sessions);
    if (!entries) directories.set(plugin.sessions, entries = new Map());
    const key = plugin.id + ":" + id;
    if (!id.trim() || entries.has(key)) throw new PluginApiError("conflict", "Duplicate or empty Agent context transform: " + key);
    entries.set(key, transform);
    plugin.lifetime.signal.addEventListener("abort", () => entries.delete(key), { once: true });
    return {};
  });
}

function validUnit(unit: AgentContextUnit): boolean {
  if (!Array.isArray(unit.items) || !unit.items.length) return false;
  const calls = new Map<string, string>();
  for (const { item } of unit.items) {
    if (item.kind === "output") for (const part of item.parts) {
      if (part.kind !== "toolcall") continue;
      if (calls.has(part.callId)) return false;
      calls.set(part.callId, part.name);
    }
    if (item.kind === "result") {
      if (calls.get(item.callId) !== item.name || !item.outcome.model.length) return false;
      calls.delete(item.callId);
    }
  }
  return calls.size === 0;
}

export function captureAgentContextTransforms(plugin: PluginContext) {
  const entries = [...directories.get(plugin.sessions) ?? []];
  if (!entries.length) return null;
  return (base: readonly AgentContextUnit[], request: AgentContextRequest): readonly AgentContextUnit[] => {
    let projection = structuredClone(base);
    for (const [id, transform] of entries) {
      const next = transform(projection, request);
      if (!Array.isArray(next) || !next.every(validUnit))
        throw new PluginApiError("invalid_argument", "Invalid Agent context projection from " + id + ". Tool calls and results must remain paired within a unit.");
      projection = next;
    }
    return projection;
  };
}
