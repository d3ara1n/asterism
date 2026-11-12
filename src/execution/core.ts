import type { z } from "zod";
import { jsonSchema, type Json, type ToolOutcome } from "../shared/model.ts";
import { reference, toolInvocationSchema, type ToolInvocationInfo, type ToolContract, type ToolInput, type ModelTools, type ModelToolCall, type ModelToolObserver } from "@asterism-app/sdk/contracts";
import type { ToolDeclaration } from "../model/contract.ts";
import type { CallResult, Invocation, PreparedResult } from "../tools/contract.ts";
import { finishToolResult, resolveToolCompletion } from "../tools/result.ts";
import { declareTool } from "../tools/definition.ts";
import { validationMessage } from "../tools/validation.ts";
import { ResourceCall, ResourceInspect, ResourceList, ResourceScript, ResourceInspectResult, ResourceListResult, ResourceScriptResult } from "../tools/core.ts";
import type { AgentCapabilities } from "./capabilities.ts";
import type { ContentLease } from "../runtime/content-store.ts";
import type { BoundTopLevelTool } from "../plugins/top-level-tools.ts";
import { ToolScheduler } from "./scheduler.ts";
import { executeResourceScript, scriptToModel } from "./script.ts";

export type PendingCall = ModelToolCall;
export type ToolObserver = ModelToolObserver;
interface DispatchContext {
  id: string;
  tools: string[];
  interactive?: boolean;
  execute(call: PendingCall, signal: AbortSignal, observer: ToolObserver): Promise<ToolOutcome>;
}
/** Fixed host operations share the same dispatcher as captured plugin top-level tools. */
interface CoreAction {
  tool: ToolContract;
  /** Receives arguments already parsed by the dispatcher. */
  resolve(args: ToolInput, capabilities: AgentCapabilities, context: DispatchContext): Invocation | PreparedResult;
}
const actions: readonly CoreAction[] = [
  { tool: ResourceList,
    resolve: (_args, capabilities) => ({ effect: "read", execution: "parallel", implementation: reference(ResourceListResult), async execute() {
      return { kind: "succeeded", data: ResourceListResult.schema.parse({ resources: await capabilities.list() }) };
    } }) },
  { tool: ResourceInspect,
    resolve(args, capabilities) {
      const { resource_id, tools, detail } = args as z.infer<typeof ResourceInspect.argsSchema>;
      return { effect: "read", execution: "parallel", implementation: reference(ResourceInspectResult), ...capabilities.identity(resource_id),
        async execute() {
          const result = await capabilities.inspect(resource_id, { tools, detail });
          return result.kind === "succeeded" ? { ...result, data: ResourceInspectResult.schema.parse(result.data) } : result;
        } };
    } },
  { tool: ResourceCall,
    resolve(args, capabilities, context) {
      const { resource_id, tool, target, args: inner } = args as z.infer<typeof ResourceCall.argsSchema>;
      return capabilities.resolve(resource_id, tool, target, inner, context.interactive);
    } },
  { tool: ResourceScript,
    resolve(args, _capabilities, context) {
      const input = args as z.infer<typeof ResourceScript.argsSchema>;
      return { effect: "write", execution: "parallel", implementation: reference(ResourceScriptResult), toModel: scriptToModel,
        execute: (signal, publish) => executeResourceScript({ ...input, ...context, signal, publish: publish ?? (() => {}) }) };
    } },
];

export function coreDeclarations(tools: readonly BoundTopLevelTool[] = []): ToolDeclaration[] {
  return [...actions, ...tools.filter(entry => entry.available)].map(({ tool }) => declareTool(tool));
}

/** Bind resource dispatch without making the model runner depend on a session or resource identity. */
export function bindModelTools(capabilities: AgentCapabilities, tools: readonly BoundTopLevelTool[] = [], handover?: ContentLease, notice?: () => void): ModelTools {
  return {
    declarations: coreDeclarations(tools),
    preview: (name, args) => previewCoreCall(name, args, capabilities, tools),
    execute: (calls, signal, settle, observer) => executeCoreBatch(calls, capabilities, signal, settle, observer, handover, tools, notice),
  };
}

/** Identity hints during argument filling use the captured catalog; the batch still validates complete calls independently. */
export function previewCoreCall(name: string, args: Json, capabilities: AgentCapabilities, tools: readonly BoundTopLevelTool[] = []): ToolInvocationInfo {
  const tool = tools.find(entry => entry.tool.name === name && entry.available);
  if (tool) return { implementation: reference(tool.tool) };
  if (name === ResourceScript.name) return { implementation: reference(ResourceScriptResult) };
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  if (typeof args.resource_id !== "string") return {};
  if (name === "resource_inspect") return capabilities.identity(args.resource_id);
  return name === "resource_call" && typeof args.tool === "string"
    ? capabilities.preview(args.resource_id, args.tool) : {};
}

interface PreparedCall {
  call: PendingCall;
  result: Invocation | PreparedResult;
  info: ToolInvocationInfo;
}
/** Direct calls and script calls share resolution, validation, scheduling, and completion. */
class ToolDispatcher {
  private readonly scheduler = new ToolScheduler();
  private readonly callableNames: string[];
  constructor(private readonly capabilities: AgentCapabilities, private readonly tools: readonly BoundTopLevelTool[],
    private readonly handover?: ContentLease, private readonly notice?: () => void) {
    this.callableNames = [...actions, ...tools.filter(entry => entry.available)]
      .filter(entry => !entry.tool.requiresInteraction)
      .map(entry => entry.tool.name).filter(name => name !== ResourceScript.name && name !== ResourceCall.name);
  }

  prepare(call: PendingCall, observer: ToolObserver, interactive?: boolean): PreparedCall {
    let result: Invocation | PreparedResult;
    const action = actions.find(action => action.tool.name === call.name);
    const extension = this.tools.find(entry => entry.tool.name === call.name);
    const definition = action?.tool ?? extension?.tool;
    if (!definition) result = { kind: "rejected", error: { code: "operation_unavailable", message: "This operation is unavailable." } };
    else {
      const parsed = definition.argsSchema.safeParse(call.arguments);
      if (!parsed.success) result = { kind: "rejected", error: { code: "invalid_arguments",
        message: `${validationMessage(parsed.error, call.name)}.` } };
      else result = action ? action.resolve(parsed.data, this.capabilities, {
        id: call.callId,
        tools: this.callableNames,
        interactive,
        execute: (child, signal, childObserver) => this.run(this.prepare(child, childObserver, false), signal, childObserver),
      }) : extension!.resolve(parsed.data, call.callId, interactive);
      if ("execute" in result && definition.requiresNotice) result = { ...result, requiresNotice: true };
    }
    const info: ToolInvocationInfo = {
      ...(result.implementation ? { implementation: result.implementation } : {}),
      ...(result.resource ? { resource: result.resource } : {}),
    };
    observer.prepared?.(call, info);
    return { call, result, info };
  }

  run(prepared: PreparedCall, signal: AbortSignal, observer: ToolObserver): Promise<ToolOutcome> {
    const { result } = prepared;
    return "execute" in result
      ? this.scheduler.run(result.execution, signal, () => this.invoke(prepared, signal, observer))
      : this.invoke(prepared, signal, observer);
  }

  private async invoke({ call, result, info }: PreparedCall, signal: AbortSignal, observer: ToolObserver): Promise<ToolOutcome> {
    const complete = (completion: CallResult, latest: Json = null) => finishToolResult(completion,
      { ...info, finishedAt: Date.now() }, latest, "execute" in result ? result.toModel : undefined);
    if (signal.aborted) return complete({ kind: "cancelled", message: "The operation was not started." });
    if (!("execute" in result)) return complete(result);
    info = { ...info, startedAt: Date.now() };
    observer.started?.(call, toolInvocationSchema.parse(info));
    if (result.requiresNotice) {
      observer.noticed?.(call);
      this.notice?.();
    }
    let latest: Json = null;
    let active = true;
    let completion: CallResult;
    try {
      completion = await result.execute(signal, data => {
        if (!active) return;
        latest = jsonSchema.parse(data);
        observer.published?.(call, latest);
      }, this.handover);
      // Validate completion data at the execution boundary; schema failures must still finalize and retain prior valid output.
      completion = resolveToolCompletion(completion, latest);
    } catch {
      completion = result.effect === "write"
        ? { kind: "unknown", message: "The tool stopped with an unknown outcome." }
        : signal.aborted ? { kind: "cancelled", message: "Operation execution was cancelled." }
          : { kind: "failed", error: { code: "tool_failed", message: "The operation could not complete." } };
    } finally { active = false; }
    return complete(completion, latest);
  }
}

/** Captured request capabilities and one scheduler cover the entire batch, including scripts' child operations. */
export async function executeCoreBatch(calls: readonly PendingCall[], capabilities: AgentCapabilities,
  signal: AbortSignal, settle: (call: PendingCall, outcome: ToolOutcome) => void,
  observer: ToolObserver = {}, handover?: ContentLease, tools: readonly BoundTopLevelTool[] = [], notice?: () => void): Promise<void> {
  const dispatcher = new ToolDispatcher(capabilities, tools, handover, notice);
  const prepared = calls.map(call => dispatcher.prepare(call, observer));
  const outcomes = await Promise.allSettled(prepared.map(async entry => settle(entry.call, await dispatcher.run(entry, signal, observer))));
  const failed = outcomes.find(outcome => outcome.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
