import { z } from "zod";
import { jsonSchema, toolOutcomeSchema, type Json, type ToolOutcome } from "../shared/model.ts";
import type { ToolDeclaration } from "../model/contract.ts";
import { schemaOf, type Invocation } from "../tools/contract.ts";
import type { AgentCapabilities } from "./capabilities.ts";

/** Weft 自身的固定操作入口；只在 provider 协议中表示为 tools，不属于资源工具目录。 */
interface WeftAction {
  name: string;
  description: string;
  schema: z.ZodType<Json>;
  resolve(args: Json, capabilities: AgentCapabilities): Invocation | ToolOutcome;
}
export interface PendingCall { callId: string; name: string; arguments: Json }
const listSchema = z.strictObject({});
const inspectSchema = z.strictObject({ resource_id: z.string().min(1) });
const callSchema = z.strictObject({ resource_id: z.string().min(1), tool: z.string().min(1), target: jsonSchema.default(null), args: jsonSchema.default({}) });

// 此目录由 Weft 维护；可扩展的工具位于独立 ToolRegistry，不注册或替换这些入口。
const actions: readonly WeftAction[] = [
  { name: "resource_list", description: "List resources currently linked to you.", schema: listSchema,
    resolve: (_args, capabilities) => ({ effect: "read", execution: "parallel", async execute() {
      const value = { resources: capabilities.list() };
      return { kind: "succeeded", model: value, data: value };
    } }) },
  { name: "resource_inspect", description: "Inspect a linked resource's live state and its available tools with parameter schemas.", schema: inspectSchema,
    resolve: (args, capabilities) => ({ effect: "read", execution: "parallel", execute: () => capabilities.inspect(inspectSchema.parse(args).resource_id) }) },
  { name: "resource_call", description: "Use a tool on a linked resource. args follows the shared tool contract; target locates an object within the resource and follows its implementation contract. Use resource_inspect to see both schemas.", schema: callSchema,
    resolve(args, capabilities) {
      const { resource_id, tool, target, args: inner } = callSchema.parse(args);
      return capabilities.resolve(resource_id, tool, target, inner);
    } },
];

export function weftDeclarations(): ToolDeclaration[] {
  return actions.map(({ name, description, schema }) => ({ name, description, parameters: schemaOf(schema) }));
}

/** 批次先解析实际资源工具，再按其执行策略调度；一级入口不消费 agent 的工具白名单。 */
export async function executeWeftBatch(calls: readonly PendingCall[], capabilities: AgentCapabilities | null,
  signal: AbortSignal, settle: (call: PendingCall, outcome: ToolOutcome) => void,
  started?: (call: PendingCall) => void): Promise<void> {
  const resolved = calls.map(call => {
    let result: Invocation | ToolOutcome;
    const action = actions.find(action => action.name === call.name);
    if (!action || !capabilities) result = { kind: "rejected", error: { code: "operation_unavailable", message: "This Weft operation is unavailable." } };
    else {
      const parsed = action.schema.safeParse(call.arguments);
      if (!parsed.success) result = { kind: "rejected", error: { code: "invalid_arguments", message: "Operation arguments do not match the schema." } };
      else result = action.resolve(parsed.data, capabilities);
    }
    return { call, result };
  });
  const run = async ({ call, result }: typeof resolved[number]): Promise<void> => {
    const complete = (outcome: ToolOutcome) => settle(call, result.implementation ? { ...outcome, implementation: result.implementation } : outcome);
    if (signal.aborted) return complete({ kind: "cancelled", message: "The operation was not started." });
    if (!("execute" in result)) return complete(result);
    started?.(call);
    let outcome: ToolOutcome;
    try { outcome = toolOutcomeSchema.parse(await result.execute(signal)); }
    catch {
      outcome = signal.aborted ? { kind: "cancelled", message: "Operation execution was cancelled." }
        : result.effect === "write" ? { kind: "unknown", message: "The tool stopped without a reliable outcome. Inspect the resource before retrying." }
          : { kind: "failed", error: { code: "tool_failed", message: "The operation could not complete." } };
    }
    complete(outcome);
  };
  if (resolved.some(({ result }) => "execute" in result && result.execution === "sequential")) {
    for (const call of resolved) await run(call);
  } else {
    const outcomes = await Promise.allSettled(resolved.map(run));
    const failed = outcomes.find(outcome => outcome.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}
