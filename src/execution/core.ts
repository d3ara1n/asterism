import type { z } from "zod";
import { jsonSchema, type Json, type ToolOutcome } from "../shared/model.ts";
import { reference, toolInvocationSchema, type ToolInvocationInfo, type ToolContract, type ToolInput, type ModelTools, type ModelToolCall, type ModelToolObserver, type ToolCallInput, type ModelToolDeclaration } from "@asterism-app/sdk/contracts";
import type { CallResult, Invocation, PreparedResult } from "../tools/contract.ts";
import { finishToolResult, resolveToolCompletion } from "../tools/result.ts";
import { declareTool } from "../tools/definition.ts";
import { validationMessage } from "../tools/validation.ts";
import { parseResourceCallText, resourceToolName, ResourceCall, ResourceCallText, ResourceInspect, ResourceList, ResourceScript, ResourceInspectResult, ResourceListResult, ResourceScriptResult } from "../tools/core.ts";
import type { AgentCapabilities } from "./capabilities.ts";
import type { ContentLease } from "../runtime/content-store.ts";
import type { BoundTopLevelTool } from "../plugins/top-level-tools.ts";
import { ToolScheduler } from "./scheduler.ts";
import { executeResourceScript, scriptToModel } from "./script.ts";
import type { ScriptResourceAddress } from "./script-protocol.ts";
import type { ToolUsageRecord, UsageSubjectRecord } from "../telemetry/types.ts";

export type PendingCall = ModelToolCall;
export type ToolObserver = ModelToolObserver;
interface DispatchContext {
  id: string;
  tools: string[];
  interactive?: boolean;
  execute(call: PendingCall, signal: AbortSignal, observer: ToolObserver, address?: ScriptResourceAddress): Promise<ToolOutcome>;
}
/** Fixed host operations share the same dispatcher as captured plugin top-level tools. */
interface CoreAction {
  tool: ToolContract;
  /** Receives input already validated by the dispatcher. */
  resolve(args: ToolInput | string, capabilities: AgentCapabilities, context: DispatchContext): Invocation | PreparedResult;
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
  { tool: ResourceCallText,
    resolve(text: string, capabilities, context) {
      const selection = parseResourceCallText(text);
      if (!selection) return { kind: "rejected", error: { code: "invalid_arguments",
        message: "The first line must be <resource_id> <tool> followed by LF or CRLF." } };
      return capabilities.resolveText(selection.id, selection.tool, selection.body, context.interactive);
    } },
  { tool: ResourceScript,
    resolve(args, _capabilities, context) {
      const input = args as z.infer<typeof ResourceScript.argsSchema>;
      return { effect: "write", execution: "parallel", implementation: reference(ResourceScriptResult), toModel: scriptToModel,
        execute: (signal, publish) => executeResourceScript({ ...input, ...context, signal, publish: publish ?? (() => {}) }) };
    } },
];

export function coreDeclarations(tools: readonly BoundTopLevelTool[] = []): ModelToolDeclaration[] {
  return [...actions, ...tools.filter(entry => entry.available)].map(({ tool }) => declareTool(tool));
}

/** Receives each settled call, including calls made by scripts; resource_call reports the resource tool it invoked. */
export type ToolSettled = (record: ToolUsageRecord) => void;
/** Bind resource dispatch without making the model runner depend on a session or resource identity. */
export function bindModelTools(capabilities: AgentCapabilities, tools: readonly BoundTopLevelTool[] = [], handover?: ContentLease, notice?: () => void,
  onToolSettled?: ToolSettled): ModelTools {
  return {
    declarations: coreDeclarations(tools),
    preview: (name, args) => previewCoreCall(name, args, capabilities, tools),
    execute: (calls, signal, settle, observer) => executeCoreBatch(calls, capabilities, signal, settle, observer, handover, tools, notice, onToolSettled),
  };
}

/** Identity hints during argument filling use the captured catalog; the batch still validates complete calls independently. */
export function previewCoreCall(name: string, input: ToolCallInput | null, capabilities: AgentCapabilities, tools: readonly BoundTopLevelTool[] = []): ToolInvocationInfo {
  const tool = tools.find(entry => entry.tool.name === name && entry.available);
  if (tool) return { implementation: reference(tool.tool) };
  if (name === ResourceScript.name) return { implementation: reference(ResourceScriptResult) };
  if (name === ResourceCallText.name && input?.kind === "freeform") {
    const selection = parseResourceCallText(input.text);
    return selection ? capabilities.preview(selection.id, selection.tool) : {};
  }
  const args = input?.kind === "structured" ? input.value : null;
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  if (typeof args.resource_id !== "string") return {};
  if (name === "resource_inspect") return capabilities.identity(args.resource_id);
  return name === "resource_call" && typeof args.tool === "string"
    ? capabilities.preview(args.resource_id, args.tool) : {};
}

function validateInput(tool: ToolContract, input: ToolCallInput): { value: ToolInput | string } | PreparedResult {
  const kind = tool.kind ?? "structured";
  const reject = (message: string): PreparedResult => ({ kind: "rejected", error: { code: "invalid_arguments", message } });
  if (kind !== input.kind) return reject(`${tool.name} requires ${kind} input.`);
  if (input.kind === "freeform") return typeof input.text === "string" ? { value: input.text } : reject(`${tool.name} requires text.`);
  const parsed = tool.argsSchema!.safeParse(input.value);
  return parsed.success ? { value: parsed.data } : reject(`${validationMessage(parsed.error, tool.name)}.`);
}

interface PreparedCall {
  call: PendingCall;
  result: Invocation | PreparedResult;
  info: ToolInvocationInfo;
  resourceTool?: string;
}
/** Direct calls and script calls share resolution, validation, scheduling, and completion. */
class ToolDispatcher {
  private readonly scheduler = new ToolScheduler();
  private readonly callableNames: string[];
  constructor(private readonly capabilities: AgentCapabilities, private readonly tools: readonly BoundTopLevelTool[],
    private readonly handover?: ContentLease, private readonly notice?: () => void,
    private readonly onToolSettled?: ToolSettled) {
    this.callableNames = [...actions, ...tools.filter(entry => entry.available)]
      .filter(entry => !entry.tool.requiresInteraction)
      .map(entry => entry.tool.name).filter(name => name !== ResourceScript.name && name !== ResourceCall.name && name !== ResourceCallText.name);
  }

  prepare(call: PendingCall, observer: ToolObserver, interactive?: boolean, address?: ScriptResourceAddress): PreparedCall {
    let result: Invocation | PreparedResult;
    const action = actions.find(action => action.tool.name === call.name);
    const extension = this.tools.find(entry => entry.tool.name === call.name);
    const definition = action?.tool ?? extension?.tool;
    if (address) {
      result = call.input.kind === "freeform" && typeof call.input.text === "string" && /^\S+$/.test(address.resourceId) && /^\S+$/.test(address.tool)
        ? this.capabilities.resolveText(address.resourceId, address.tool, call.input.text, false)
        : { kind: "rejected", error: { code: "invalid_arguments", message: "The resource handle requires a valid resource ID and tool name." } };
    } else if (!definition) result = { kind: "rejected", error: { code: "operation_unavailable", message: "This operation is unavailable." } };
    else {
      const input = validateInput(definition, call.input);
      result = "kind" in input ? input : action ? action.resolve(input.value, this.capabilities, {
        id: call.callId,
        tools: this.callableNames,
        interactive,
        execute: (child, signal, childObserver, address) => this.run(this.prepare(child, childObserver, false, address), signal, childObserver),
      }) : extension!.resolve(input.value, call.callId, interactive);
      if ("execute" in result && definition.requiresNotice) result = { ...result, requiresNotice: true };
    }
    const info: ToolInvocationInfo = {
      ...(result.implementation ? { implementation: result.implementation } : {}),
      ...(result.resource ? { resource: result.resource } : {}),
    };
    observer.prepared?.(call, info);
    return { call, result, info, resourceTool: address?.tool ?? resourceToolName(call.name, call.input) };
  }

  run(prepared: PreparedCall, signal: AbortSignal, observer: ToolObserver): Promise<ToolOutcome> {
    const { result } = prepared;
    return "execute" in result
      ? this.scheduler.run(result.execution, signal, () => this.invoke(prepared, signal, observer))
      : this.invoke(prepared, signal, observer);
  }

  private async invoke({ call, result, info, resourceTool }: PreparedCall, signal: AbortSignal, observer: ToolObserver): Promise<ToolOutcome> {
    const subjects: UsageSubjectRecord[] = [];
    const complete = (completion: CallResult, latest: Json = null) => {
      const finishedAt = Date.now();
      const outcome = finishToolResult(completion, { ...info, finishedAt }, latest, "execute" in result ? result.toModel : undefined);
      this.onToolSettled?.({ startedAt: info.startedAt ?? finishedAt, durationMs: info.startedAt === undefined ? null : finishedAt - info.startedAt,
        toolName: resourceTool ?? call.name, implementationId: info.implementation?.id ?? null, resourceKind: info.resource?.kind ?? null,
        outcome: outcome.kind, errorCode: "error" in outcome ? outcome.error.code : null, subjects });
      return outcome;
    };
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
      }, this.handover, subject => { if (active) subjects.push(subject); });
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
  observer: ToolObserver = {}, handover?: ContentLease, tools: readonly BoundTopLevelTool[] = [], notice?: () => void,
  onToolSettled?: ToolSettled): Promise<void> {
  const dispatcher = new ToolDispatcher(capabilities, tools, handover, notice, onToolSettled);
  const prepared = calls.map(call => dispatcher.prepare(call, observer));
  const outcomes = await Promise.allSettled(prepared.map(async entry => settle(entry.call, await dispatcher.run(entry, signal, observer))));
  const failed = outcomes.find(outcome => outcome.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
