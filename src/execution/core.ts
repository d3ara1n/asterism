import { jsonSchema, type Json, type ToolOutcome } from "../shared/model.ts";
import { toolInvocationSchema, type ToolInvocationInfo } from "@asterism/sdk/contracts";
import { reference } from "@asterism/sdk/contracts";
import type { ToolDeclaration } from "../model/contract.ts";
import type { ToolContract } from "@asterism/sdk/contracts";
import type { CallResult, Invocation, PreparedResult } from "../tools/contract.ts";
import { finishToolResult, resolveToolCompletion } from "../tools/result.ts";
import { declareTool } from "../tools/definition.ts";
import { jsonArgumentHint, validationMessage } from "../tools/validation.ts";
import { ResourceCall, ResourceInspect, ResourceList, ResourceInspectResult, ResourceListResult } from "../tools/core.ts";
import type { AgentCapabilities } from "./capabilities.ts";
import type { ContentLease } from "../runtime/content-store.ts";
import type { BoundTopLevelTool } from "../plugins/top-level-tools.ts";

/** Fixed host operation entries; represented as tools only in the provider protocol, outside the resource tool catalog. */
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

// Host entries cannot be overridden; static contributions captured at request start supply plugin top-level tools.
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

export function coreDeclarations(tools: readonly BoundTopLevelTool[] = []): ToolDeclaration[] {
  return [...actions, ...tools].map(({ tool }) => declareTool(tool));
}

/** Identity hints during argument filling use the captured catalog; the batch still validates complete calls independently. */
export function previewCoreCall(name: string, args: Json, capabilities: AgentCapabilities, tools: readonly BoundTopLevelTool[] = []): ToolInvocationInfo {
  const tool = tools.find(entry => entry.tool.name === name);
  if (tool) return { implementation: reference(tool.tool) };
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  if (typeof args.resource_id !== "string") return {};
  if (name === "resource_inspect") return capabilities.identity(args.resource_id);
  return name === "resource_call" && typeof args.tool === "string"
    ? capabilities.preview(args.resource_id, args.tool) : {};
}

/** Resolve actual resource tools before scheduling by execution policy; published snapshots do not change the batch's model delivery boundary. */
export async function executeCoreBatch(calls: readonly PendingCall[], capabilities: AgentCapabilities | null,
  signal: AbortSignal, settle: (call: PendingCall, outcome: ToolOutcome) => void,
  observer: ToolObserver = {}, handover?: ContentLease, tools: readonly BoundTopLevelTool[] = []): Promise<void> {
  const resolved = calls.map(call => {
    let result: Invocation | PreparedResult;
    const action = actions.find(action => action.tool.name === call.name);
    const extension = tools.find(entry => entry.tool.name === call.name);
    const definition = action?.tool ?? extension?.tool;
    if (!definition || !capabilities) result = { kind: "rejected", error: { code: "operation_unavailable", message: "This operation is unavailable." } };
    else {
      const parsed = definition.argsSchema.safeParse(call.arguments);
      if (!parsed.success) result = { kind: "rejected", error: { code: "invalid_arguments",
        message: `${validationMessage(parsed.error, call.name)}.${call.name === "resource_call" ? ` ${jsonArgumentHint}` : ""}` } };
      else result = action ? action.resolve(parsed.data, capabilities) : extension!.resolve(parsed.data, call.callId);
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
      }, handover);
      // Validate completion data at the execution boundary; schema failures must still finalize and retain prior valid output.
      completion = resolveToolCompletion(completion, latest);
    } catch {
      completion = result.effect === "write"
        ? { kind: "unknown", message: "The tool stopped with an unknown outcome." }
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
