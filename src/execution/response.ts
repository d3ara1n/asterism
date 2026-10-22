import type { ModelBlock, ModelSource, ModelCompletion, ModelLiveBlock, ToolInvocationInfo, ToolResult, Presentation } from "@atelier/sdk/contracts";
import { ModelFailure, type ModelEvent, type StreamPart } from "../model/contract.ts";
import { previewArguments } from "../shared/partial-arguments.ts";
import type { Json, ToolOutcome } from "../shared/model.ts";

type BufferedBlock = {
  part: StreamPart;
  ordinal: number;
  text: string;
  summary: string;
  startedAt: number;
  endedAt: number | null;
  arguments: Json;
  previewArguments: Json;
  previewText: string;
  continuation: Json;
  emitted: boolean;
  executing: boolean;
  invocation: ToolInvocationInfo | null;
  result: Extract<ToolResult, { kind: "running" }> | null;
};
export type LiveCall = BufferedBlock & { part: Extract<StreamPart, { kind: "toolcall" }> };

/** 一次响应的内存状态机：拒绝乱序/重复事件，只有完整参数才能进入工具执行。 */
export class ResponseBuffer {
  private readonly blocks = new Map<string, BufferedBlock>();
  private readonly callIds = new Set<string>();
  finish: Extract<ModelEvent, { type: "finish" }> | null = null;
  private finalized = false;

  constructor(
    private readonly identity: { responseId: string; requestParentId: string | null; source: ModelSource },
    private readonly onBlock: (block: ModelBlock) => void,
    private readonly extensions: Presentation[] = [],
  ) {}

  get empty(): boolean { return this.blocks.size === 0; }
  get completion(): ModelCompletion | null {
    return this.finish ? {
      usage: this.finish.usage, finishReason: this.finish.reason,
      rawFinishReason: this.finish.rawFinishReason ?? null, providerResponseId: this.finish.responseId ?? null,
      ...(this.finish.timing ? { timing: this.finish.timing } : {}),
      ...(this.extensions.length ? { extensions: this.extensions } : {}),
    } : null;
  }

  accept(event: ModelEvent): void {
    if (this.finalized) throw new ModelFailure("protocol", "The response is already closed.");
    if (this.finish) throw new ModelFailure("protocol", "The provider emitted data after the response ended.");
    if (event.type === "part.start") {
      if (this.blocks.has(event.part.id) || (event.part.kind === "toolcall" && this.callIds.has(event.part.callId))) {
        throw new ModelFailure("protocol", "The provider started a duplicate response block.");
      }
      if (event.part.kind === "toolcall") this.callIds.add(event.part.callId);
      this.blocks.set(event.part.id, { part: event.part, ordinal: this.blocks.size, text: "", summary: "", startedAt: Date.now(), arguments: null, previewArguments: null, previewText: "", continuation: null,
        endedAt: null, emitted: false, executing: false, invocation: null, result: null });
      return;
    }
    if (event.type === "finish") {
      this.finish = event;
      if ([...this.blocks.values()].some(block => block.endedAt === null)) {
        throw new ModelFailure("incomplete", "The model response ended with incomplete blocks. No tools were executed.");
      }
      // 终态到达后，正文与计量一同提交；工具块继续等待各自结局。
      for (const block of this.blocks.values()) if (block.part.kind !== "toolcall") this.emitBlock(block, true);
      return;
    }
    const block = this.blocks.get(event.partId);
    if (!block || block.endedAt !== null) throw new ModelFailure("protocol", "The provider updated an inactive response block.");
    if (event.type === "part.delta") {
      if (event.channel === "summary") {
        if (block.part.kind !== "thinking") throw new ModelFailure("protocol", "Only thinking blocks can carry a summary.");
        block.summary += event.delta;
      } else block.text += event.delta;
      return;
    }
    block.arguments = event.arguments ?? null;
    block.continuation = event.continuation ?? null;
    block.endedAt = Date.now();
  }

  calls(): LiveCall[] {
    return [...this.blocks.values()].filter((block): block is LiveCall => block.part.kind === "toolcall");
  }

  isToolInput(partId: string): boolean {
    const block = this.blocks.get(partId);
    return block?.part.kind === "toolcall" && block.endedAt === null;
  }

  /** 宽容解析只用于即时展示，不能覆盖执行参数或未完成历史的参数。 */
  async preview(identity: (name: string, args: Json) => ToolInvocationInfo): Promise<void> {
    for (const block of this.calls()) {
      if (block.emitted || block.executing) continue;
      if (block.endedAt === null && block.previewText !== block.text) {
        block.previewText = block.text;
        block.previewArguments = previewArguments(block.text);
      }
      block.invocation = identity(block.part.name, block.endedAt !== null ? block.arguments : block.previewArguments);
    }
  }

  live(): ModelLiveBlock[] {
    return [...this.blocks.values()].filter(block => !block.emitted).map(block => {
      const base = { id: `${this.identity.responseId}:${block.ordinal}`,
        responseId: this.identity.responseId, ordinal: block.ordinal };
      return block.part.kind === "toolcall"
        ? { ...base, kind: "toolcall", name: block.part.name, argumentsText: block.text, arguments: block.endedAt !== null ? block.arguments : block.previewArguments,
          state: block.executing ? "executing" : block.endedAt !== null ? "ready" : "input", invocation: block.invocation, result: block.result }
        : block.part.kind === "thinking" ? { ...base, kind: "thinking", text: block.text || block.summary, startedAt: block.startedAt, endedAt: block.endedAt }
          : { ...base, kind: "text", text: block.text, endedAt: block.endedAt };
    });
  }

  settle(call: LiveCall, outcome: ToolOutcome): void {
    this.emitBlock(call, true, outcome);
  }

  prepare(call: LiveCall, info: ToolInvocationInfo): void {
    call.invocation = info;
  }

  start(call: LiveCall, info: ToolInvocationInfo = {}): void {
    call.executing = true;
    call.invocation = info;
    call.result = { kind: "running", data: null };
  }

  publish(call: LiveCall, data: Json): void {
    if (this.finalized || call.emitted || !call.executing) return;
    call.result = { kind: "running", data };
  }

  /** 收束剩余块；未结束的正文与未执行调用在块内标记不完整，不另发终态记录。 */
  close(): void {
    if (this.finalized) return;
    for (const block of this.blocks.values()) {
      if (!block.emitted) this.emitBlock(block, block.part.kind !== "toolcall" && block.endedAt !== null);
    }
    this.finalized = true;
  }

  private emitBlock(block: BufferedBlock, complete: boolean, outcome: ToolOutcome | null = null): void {
    if (block.emitted) throw new ModelFailure("protocol", "The response block has already been emitted.");
    const common = { ...this.identity, ordinal: block.ordinal, complete, continuation: block.continuation,
      completion: block.ordinal === this.blocks.size - 1 ? this.completion : null };
    this.onBlock(block.part.kind === "toolcall"
      ? { ...common, kind: "toolcall" as const, callId: block.part.callId, name: block.part.name, argumentsText: block.arguments === null ? block.text : null, arguments: block.arguments, outcome }
      : block.part.kind === "thinking" ? { ...common, kind: "thinking", text: block.text, summary: block.summary }
        : { ...common, kind: "text", text: block.text });
    block.emitted = true;
  }
}
