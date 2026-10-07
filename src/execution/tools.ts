import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import type { AgentConfiguration } from "../shared/configuration.ts";
import { toolOutcomeSchema, type Json, type ToolOutcome, type ToolPart } from "../shared/conversation.ts";
import type { InFlightTurn } from "../history/fold.ts";
import type { ConversationStore } from "../conversation/store.ts";
import type { ToolDeclaration } from "../model/contract.ts";

export interface RuntimeTool extends ToolDeclaration {
  schema: ZodType<Json>;
  permission: string;
  effect: "read" | "write";
  execution: "parallel" | "sequential";
  execute(args: Json, signal: AbortSignal): Promise<ToolOutcome>;
}
export function allowedTool(agent: AgentConfiguration, name: string): boolean {
  return (agent.tools === null || agent.tools.includes(name)) && !(agent.excludeTools ?? []).includes(name);
}
export async function executeToolBatch(store: ConversationStore, nodeId: string, calls: ToolPart[], tools: RuntimeTool[], agent: AgentConfiguration, turn: InFlightTurn, signal: AbortSignal): Promise<void> {
  const run = async (call: ToolPart): Promise<void> => {
    const settle = (outcome: ToolOutcome) => store.append({ type: "tool.settled", nodeId, partId: call.id, outcome });
    if (signal.aborted) { settle({ kind: "cancelled", message: "The tool was not started." }); return; }
    const tool = tools.find(t => t.name === call.name);
    if (!tool || !allowedTool(agent, call.name)) {
      settle({ kind: "rejected", error: { code: "tool_unavailable", message: "This tool is unavailable to the agent." } }); return;
    }
    const args = tool.schema.safeParse(call.arguments);
    if (!args.success) { settle({ kind: "rejected", error: { code: "invalid_arguments", message: "Tool arguments do not match the schema." } }); return; }
    const resourceId = args.data && typeof args.data === "object" && !Array.isArray(args.data) ? args.data.resource_id : null;
    if (typeof resourceId !== "string" || !turn.bindings.some(b => b.resource_id === resourceId && b.permissions.includes(tool.permission))) {
      settle({ kind: "rejected", error: { code: "access_denied", message: "The resource is not authorized for this operation in the current turn." } }); return;
    }
    const operationId = randomUUID();
    store.append({ type: "tool.started", nodeId, partId: call.id }, [{ type: "operation_started", payload: {
      operation_id: operationId, agent_id: store.agentId, turn_id: turn.turn_id, resource_id: resourceId,
      name: tool.name, params: { callId: call.callId, nodeId, arguments: args.data },
    } }]);
    let outcome: ToolOutcome;
    try { outcome = toolOutcomeSchema.parse(await tool.execute(args.data, signal)); }
    catch {
      outcome = tool.effect === "write" ? { kind: "unknown", message: "The tool stopped without a reliable outcome. Inspect the resource before retrying." }
        : signal.aborted ? { kind: "cancelled", message: "Tool execution was cancelled." }
          : { kind: "failed", error: { code: "tool_failed", message: "The tool could not complete the operation." } };
    }
    store.append({ type: "tool.settled", nodeId, partId: call.id, outcome }, [{ type: "operation_finished", payload: {
      operation_id: operationId, status: outcome.kind === "succeeded" ? "succeeded" : outcome.kind === "partial" ? "partial" : outcome.kind === "unknown" ? "unknown" : "failed",
      result: outcome,
    } }]);
  };
  if (calls.some(c => tools.find(t => t.name === c.name)?.execution === "sequential")) {
    for (const call of calls) await run(call);
  } else {
    const results = await Promise.allSettled(calls.map(run));
    const failed = results.find(r => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}
