import { ModelFailure, type ModelEvent, type StreamPart } from "../model/contract.ts";
import { parsePartialJson } from "ai";
import { jsonSchema, type Json, type ToolOutcome } from "../shared/model.ts";
import type { ToolInvocationInfo, ToolResult } from "@atelier/sdk/contracts";
import { emptyCompletion, type BlockCompletion, type LiveBlock, type NewNode } from "../shared/session.ts";

type BufferedBlock = {
  part: StreamPart;
  ordinal: number;
  text: string;
  startedAt: number;
  arguments: Json;
  previewArguments: Json;
  previewText: string;
  continuation: Json;
  done: boolean;
  savedId: string | null;
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
    private readonly identity: { agentId: string; responseId: string; requestParentId: string | null; model: string; adapter: string; scope: string },
    private readonly append: (node: NewNode) => string,
    private readonly complete: (blockId: string | null, completion: BlockCompletion) => void,
  ) {}

  accept(event: ModelEvent): void {
    if (this.finalized) throw new ModelFailure("protocol", "The response is already closed.");
    if (this.finish) throw new ModelFailure("protocol", "The provider emitted data after the response ended.");
    if (event.type === "part.start") {
      if (this.blocks.has(event.part.id) || (event.part.kind === "toolcall" && this.callIds.has(event.part.callId))) {
        throw new ModelFailure("protocol", "The provider started a duplicate response block.");
      }
      if (event.part.kind === "toolcall") this.callIds.add(event.part.callId);
      this.blocks.set(event.part.id, { part: event.part, ordinal: this.blocks.size, text: "", startedAt: Date.now(), arguments: null, previewArguments: null, previewText: "", continuation: null,
        done: false, savedId: null, executing: false, invocation: null, result: null });
      return;
    }
    if (event.type === "finish") {
      this.finish = event;
      if ([...this.blocks.values()].some(block => !block.done)) {
        throw new ModelFailure("incomplete", "The model response ended with incomplete blocks. No tools were executed.");
      }
      return;
    }
    const block = this.blocks.get(event.partId);
    if (!block || block.done) throw new ModelFailure("protocol", "The provider updated an inactive response block.");
    if (event.type === "part.delta") {
      block.text += event.delta;
      return;
    }
    block.arguments = event.arguments ?? null;
    block.continuation = event.continuation ?? null;
    block.done = true;
    if (block.part.kind !== "toolcall") this.save(block, true);
  }

  calls(): LiveCall[] {
    return [...this.blocks.values()].filter((block): block is LiveCall => block.part.kind === "toolcall");
  }

  isToolInput(partId: string): boolean {
    const block = this.blocks.get(partId);
    return block?.part.kind === "toolcall" && !block.done;
  }

  /** 宽容解析只用于即时展示，不能覆盖执行参数或未完成历史的参数。 */
  async preview(identity: (name: string, args: Json) => ToolInvocationInfo): Promise<void> {
    for (const block of this.calls()) {
      if (block.savedId || block.executing) continue;
      if (!block.done && block.previewText !== block.text) {
        const text = block.text;
        const parsed = await parsePartialJson(text);
        if (block.done || block.savedId || text !== block.text) continue;
        block.previewText = text;
        const preview = jsonSchema.safeParse(parsed.value);
        block.previewArguments = preview.success ? preview.data : null;
      }
      block.invocation = identity(block.part.name, block.done ? block.arguments : block.previewArguments);
    }
  }

  live(): LiveBlock[] {
    return [...this.blocks.values()].filter(block => !block.savedId).map(block => {
      const base = { id: `${this.identity.responseId}:${block.ordinal}`, agentId: this.identity.agentId,
        responseId: this.identity.responseId, ordinal: block.ordinal };
      return block.part.kind === "toolcall"
        ? { ...base, kind: "toolcall", name: block.part.name, argumentsText: block.text, arguments: block.done ? block.arguments : block.previewArguments,
          state: block.executing ? "executing" : block.done ? "ready" : "input", invocation: block.invocation, result: block.result }
        : block.part.kind === "thinking" ? { ...base, kind: "thinking", text: block.text, startedAt: block.startedAt }
          : { ...base, kind: "text", text: block.text };
    });
  }

  settle(call: LiveCall, outcome: ToolOutcome): void {
    this.save(call, true, outcome);
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
    if (this.finalized || call.savedId || !call.executing) return;
    call.result = { kind: "running", data };
  }

  /** 未执行的调用和未结束的块只留审计记录，已保存的块不重复追加。 */
  interrupt(): void {
    for (const block of this.blocks.values()) if (!block.savedId) this.save(block, false);
  }

  /** 保留所有收到的块后，将终态归属到响应序号最大的实际块，重复关闭不重复计量。 */
  close(): void {
    if (this.finalized) return;
    this.interrupt();
    if (this.finish) {
      const last = [...this.blocks.values()].at(-1);
      this.complete(last?.savedId ?? null, {
        usage: this.finish.usage, finishReason: this.finish.reason,
        rawFinishReason: this.finish.rawFinishReason ?? null, providerResponseId: this.finish.responseId ?? null,
      });
    }
    this.finalized = true;
  }

  private save(block: BufferedBlock, complete: boolean, outcome: ToolOutcome | null = null): void {
    if (block.savedId) throw new ModelFailure("protocol", "The response block is already saved.");
    const common = { ...this.identity, ...emptyCompletion, ordinal: block.ordinal, complete, continuation: block.continuation };
    block.savedId = this.append(block.part.kind === "toolcall"
      ? { ...common, kind: "toolcall", callId: block.part.callId, name: block.part.name, argumentsText: block.text, arguments: block.arguments, outcome }
      : { ...common, kind: block.part.kind, text: block.text });
  }
}
