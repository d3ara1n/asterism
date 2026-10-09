import type { ZodType } from "zod";
import type { AgentConfiguration } from "../shared/configuration.ts";
import { toolOutcomeSchema, type Json, type ToolOutcome } from "../shared/model.ts";
import type { ToolDeclaration } from "../model/contract.ts";

export interface RuntimeTool extends ToolDeclaration {
  schema: ZodType<Json>;
  permission: string;
  effect: "read" | "write";
  execution: "parallel" | "sequential";
  /** 全局资源工具自行按链接校验目标，不走 resource_id 前置检查。 */
  global?: boolean;
  execute(args: Json, signal: AbortSignal): Promise<ToolOutcome>;
}
export interface PendingCall { callId: string; name: string; arguments: Json }
export function allowedTool(agent: AgentConfiguration, name: string): boolean {
  return (agent.tools === null || agent.tools.includes(name)) && !(agent.excludeTools ?? []).includes(name);
}

/** 执行一批调用；每个调用一旦有结局就交给 settle 落库。授权按本轮有效链接集合判定。 */
export async function executeToolBatch(calls: PendingCall[], tools: RuntimeTool[], agent: AgentConfiguration,
  linked: ReadonlySet<string>, signal: AbortSignal, settle: (call: PendingCall, outcome: ToolOutcome) => void): Promise<void> {
  const run = async (call: PendingCall): Promise<void> => {
    if (signal.aborted) return settle(call, { kind: "cancelled", message: "The tool was not started." });
    const tool = tools.find(t => t.name === call.name);
    if (!tool || !allowedTool(agent, call.name)) return settle(call, { kind: "rejected", error: { code: "tool_unavailable", message: "This tool is unavailable to the agent." } });
    const args = tool.schema.safeParse(call.arguments);
    if (!args.success) return settle(call, { kind: "rejected", error: { code: "invalid_arguments", message: "Tool arguments do not match the schema." } });
    const resourceId = args.data && typeof args.data === "object" && !Array.isArray(args.data) ? args.data.resource_id : null;
    if (!tool.global && (typeof resourceId !== "string" || !linked.has(resourceId))) {
      return settle(call, { kind: "rejected", error: { code: "access_denied", message: "The resource is not linked to this agent." } });
    }
    let outcome: ToolOutcome;
    try { outcome = toolOutcomeSchema.parse(await tool.execute(args.data, signal)); }
    catch {
      outcome = signal.aborted ? { kind: "cancelled", message: "Tool execution was cancelled." }
        : tool.effect === "write" ? { kind: "unknown", message: "The tool stopped without a reliable outcome. Inspect the resource before retrying." }
          : { kind: "failed", error: { code: "tool_failed", message: "The tool could not complete the operation." } };
    }
    settle(call, outcome);
  };
  if (calls.some(c => tools.find(t => t.name === c.name)?.execution === "sequential")) for (const call of calls) await run(call);
  else {
    const results = await Promise.allSettled(calls.map(run));
    const failed = results.find(r => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}
