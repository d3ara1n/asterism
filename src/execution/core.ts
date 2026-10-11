import { jsonSchema, type Json, type ToolOutcome } from "../shared/model.ts";
import { toolInvocationSchema, type ToolInvocationInfo } from "@atelier/sdk/contracts";
import { reference } from "@atelier/sdk/contracts";
import type { ToolDeclaration } from "../model/contract.ts";
import type { ToolContract } from "@atelier/sdk/contracts";
import type { CallResult, Invocation, PreparedResult } from "../tools/contract.ts";
import { finishToolResult, resolveToolCompletion } from "../tools/result.ts";
import { declareTool } from "../tools/definition.ts";
import { jsonArgumentHint, validationMessage } from "../tools/validation.ts";
import { ResourceCall, ResourceInspect, ResourceList, ResourceInspectResult, ResourceListResult } from "../tools/core.ts";
import type { AgentCapabilities } from "./capabilities.ts";

/** 宿主固定操作入口；只在 provider 协议中表示为 tools，不属于资源工具目录。 */
interface CoreAction {
  tool: ToolContract;
  resolve(args: Json, capabilities: AgentCapabilities): Invocation | PreparedResult;
}
export interface PendingCall { callId: string; name: string; arguments: Json }
export interface ToolObserver {
  prepared?(call: PendingCall, info: ToolInvocationInfo): void;
  started?(call: PendingCall, info: ToolInvocationInfo): void;
  published?(call: PendingCall, data: Json): void;
}

// 此目录由宿主维护；可扩展的工具位于独立 ToolRegistry，不注册或替换这些入口。
const actions: readonly CoreAction[] = [
  { tool: ResourceList,
    resolve: (_args, capabilities) => ({ effect: "read", execution: "parallel", implementation: reference(ResourceListResult), async execute() {
      return { kind: "succeeded", data: ResourceListResult.schema.parse({ resources: capabilities.list() }) };
    } }) },
  { tool: ResourceInspect,
    resolve(args, capabilities) {
      const { resource_id } = ResourceInspect.argsSchema.parse(args);
      return { effect: "read", execution: "parallel", implementation: reference(ResourceInspectResult), ...capabilities.identity(resource_id),
        async execute() {
          const result = await capabilities.inspect(resource_id);
          return result.kind === "succeeded" ? { ...result, data: ResourceInspectResult.schema.parse(result.data) } : result;
        } };
    } },
  { tool: ResourceCall,
    resolve(args, capabilities) {
      const { resource_id, tool, target, args: inner } = ResourceCall.argsSchema.parse(args);
      return capabilities.resolve(resource_id, tool, target, inner);
    } },
];

export function coreDeclarations(): ToolDeclaration[] {
  return actions.map(({ tool }) => declareTool(tool));
}

/** 批次先解析实际资源工具，再按其执行策略调度；发布快照不改变批次的模型交付边界。 */
export async function executeCoreBatch(calls: readonly PendingCall[], capabilities: AgentCapabilities | null,
  signal: AbortSignal, settle: (call: PendingCall, outcome: ToolOutcome) => void,
  observer: ToolObserver = {}): Promise<void> {
  const resolved = calls.map(call => {
    let result: Invocation | PreparedResult;
    const action = actions.find(action => action.tool.name === call.name);
    if (!action || !capabilities) result = { kind: "rejected", error: { code: "operation_unavailable", message: "This core operation is unavailable." } };
    else {
      const parsed = action.tool.argsSchema.safeParse(call.arguments);
      if (!parsed.success) result = { kind: "rejected", error: { code: "invalid_arguments",
        message: `${validationMessage(parsed.error, call.name)}. Correct the reported fields and retry.${call.name === "resource_call" ? ` ${jsonArgumentHint}` : ""}` } };
      else result = action.resolve(parsed.data, capabilities);
    }
    const info: ToolInvocationInfo = {
      ...(result.implementation ? { implementation: result.implementation } : {}),
      ...(result.resource ? { resource: result.resource } : {}),
    };
    observer.prepared?.(call, info);
    return { call, result, info };
  });
  const run = async ({ call, result, info }: typeof resolved[number]): Promise<void> => {
    const complete = (completion: CallResult, latest: Json = null) => settle(call,
      finishToolResult(completion, { ...info, finishedAt: Date.now() }, latest, "execute" in result ? result.toModel : undefined));
    if (signal.aborted) return complete({ kind: "cancelled", message: "The operation was not started." });
    if (!("execute" in result)) return complete(result);
    info = { ...info, startedAt: Date.now() };
    observer.started?.(call, toolInvocationSchema.parse(info));
    let latest: Json = null;
    let active = true;
    let completion: CallResult;
    try {
      completion = await result.execute(signal, data => {
        if (!active) return;
        latest = jsonSchema.parse(data);
        observer.published?.(call, latest);
      });
      // 在执行边界校验终结数据；schema 错误也必须收束并保留之前的合法产出。
      completion = resolveToolCompletion(completion, latest);
    } catch {
      completion = result.effect === "write"
        ? { kind: "unknown", message: "The tool stopped without a reliable outcome. Inspect the resource before retrying." }
        : signal.aborted ? { kind: "cancelled", message: "Operation execution was cancelled." }
          : { kind: "failed", error: { code: "tool_failed", message: "The operation could not complete." } };
    } finally { active = false; }
    complete(completion, latest);
  };
  if (resolved.some(({ result }) => "execute" in result && result.execution === "sequential")) {
    for (const call of resolved) await run(call);
  } else {
    const outcomes = await Promise.allSettled(resolved.map(run));
    const failed = outcomes.find(outcome => outcome.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}
