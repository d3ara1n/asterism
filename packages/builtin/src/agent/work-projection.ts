import type { ModelItem, SessionSnapshot } from "@asterism-app/sdk/contracts";
import type { PluginContext } from "@asterism-app/sdk/runtime";
import { AgentInputMessage } from "@asterism-app/builtin-api/contracts";
import { captureAgentContextTransforms, type AgentContextUnit } from "@asterism-app/builtin-api/runtime";
import { contextMessages, projectAgentContext, type AgentContext } from "./projection.ts";
import { turnStartRead } from "./input-message.ts";
import { readRecords } from "../shared/record-reading.ts";

export type WorkMessages = (snapshot: Pick<SessionSnapshot, "id" | "records">, agentId: string, startsTurn?: boolean) => ModelItem[];

function projectUnits(context: AgentContext, agentId: string, snapshot: Parameters<WorkMessages>[0]) {
  const first = context.path[0];
  let turn = first ? readRecords(turnStartRead(agentId, first.id), snapshot.records.all)?.sequence ?? 0 : 0;
  const turns = new Map<string, number>();
  for (const record of context.path) {
    if (record.source?.resource?.id === agentId) {
      const input = AgentInputMessage.decode(record);
      if (input?.status === "known" && input.data.startsTurn) turn = record.sequence;
    }
    turns.set(record.id, turn);
  }
  const units: AgentContextUnit[] = [];
  if (context.summary) units.push({ turn: 0, items: [{ item: contextMessages({ ...context, groups: [] })[0]! }] });
  for (const group of context.groups) {
    const first = context.path[group.first]!;
    const sourceTurn = group.startRecord !== undefined ? (group.startRecord === null ? 0 : turns.get(group.startRecord)) : turns.get(first.id);
    units.push({ turn: sourceTurn ?? turns.get(first.id) ?? 0, items: group.items.map(item => {
      const record = item.kind === "result" ? group.resultRecords?.get(item.callId) : item.kind === "output" ? null : first;
      const parts = item.kind === "result" ? item.outcome.model : item.parts;
      return record ? { item, origin: { recordId: record.id, parts: parts.map((_, index) => index) } } : { item };
    }) });
  }
  return { units, turn };
}

/** Request-only projection; history, UI and compaction continue to read the untransformed timeline. */
export function createWorkProjection(plugin: PluginContext): WorkMessages {
  return (snapshot, agentId, startsTurn) => {
    const context = projectAgentContext(snapshot, agentId);
    const run = captureAgentContextTransforms(plugin);
    if (!run) return contextMessages(context);
    const base = projectUnits(context, agentId, snapshot);
    const turn = startsTurn ? (context.path.at(-1)?.sequence ?? 0) + 1 : base.turn;
    return run(base.units, { sessionId: snapshot.id, agentId, turn }).flatMap(unit => unit.items.map(({ item }) => item));
  };
}
