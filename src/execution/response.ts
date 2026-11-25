import type { ModelBlock, ModelSource, ModelCompletion, ModelLiveBlock, ModelRunRequest, ToolInvocationInfo, ToolResult, Presentation, ToolCallInput, ToolInputDraft, ModelTermination, RequestTiming, Usage } from "@asterism-app/sdk/contracts";
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
  input: ToolCallInput | null;
  previewInput: ToolCallInput | null;
  previewText: string;
  continuation: Json;
  emitted: boolean;
  published: boolean;
  executing: boolean;
  invocation: ToolInvocationInfo | null;
  result: Extract<ToolResult, { kind: "running" }> | null;
  noticeAt?: number;
};
export type LiveCall = BufferedBlock & { part: Extract<StreamPart, { kind: "toolcall" }> };

/** In-memory state machine for one response: rejects out-of-order/duplicate events; only complete arguments can enter tool execution. */
export class ResponseBuffer {
  private readonly blocks = new Map<string, BufferedBlock>();
  private readonly callIds = new Set<string>();
  finish: Extract<ModelEvent, { type: "finish" }> | null = null;
  private finalized = false;
  private termination: ModelCompletion | null = null;
  private phantoms?: ReadonlySet<number>;

  constructor(
    private readonly identity: { responseId: string; requestParentId: string | null; source: ModelSource },
    private readonly onBlock: (block: ModelBlock, type: "block" | "tool.begin" | "tool.complete") => void,
    private readonly extensions: Presentation[] = [],
    private readonly contextPhantoms?: ModelRunRequest["contextPhantoms"],
  ) {}

  get empty(): boolean { return this.blocks.size === 0; }
  get completion(): ModelCompletion | null {
    return this.termination ?? (this.finish ? {
      usage: this.finish.usage, finishReason: this.finish.reason,
      rawFinishReason: this.finish.rawFinishReason ?? null, providerResponseId: this.finish.responseId ?? null,
      ...(this.finish.timing ? { timing: this.finish.timing } : {}),
      ...(this.extensions.length ? { extensions: this.extensions } : {}),
    } : null);
  }

  accept(event: ModelEvent): void {
    if (this.finalized) throw new ModelFailure("protocol", "The response is already closed.");
    if (this.finish) throw new ModelFailure("protocol", "The provider emitted data after the response ended.");
    if (event.type === "part.start") {
      if (this.blocks.has(event.part.id) || (event.part.kind === "toolcall" && this.callIds.has(event.part.callId))) {
        throw new ModelFailure("protocol", "The provider started a duplicate response block.");
      }
      if (event.part.kind === "toolcall") this.callIds.add(event.part.callId);
      this.blocks.set(event.part.id, { part: event.part, ordinal: this.blocks.size, text: "", summary: "", startedAt: Date.now(), input: null, previewInput: null, previewText: "", continuation: null,
        endedAt: null, emitted: false, published: false, executing: false, invocation: null, result: null });
      return;
    }
    if (event.type === "finish") {
      this.finish = event;
      if ([...this.blocks.values()].some(block => block.endedAt === null)) {
        throw new ModelFailure("incomplete", "The model response ended with incomplete blocks. No tools were executed.", undefined, "model");
      }
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
    if (block.part.kind === "toolcall" && event.input?.kind !== block.part.inputKind)
      throw new ModelFailure("protocol", "The provider completed a call without matching tool input.");
    if (block.part.kind !== "toolcall" && event.input)
      throw new ModelFailure("protocol", "Only tool calls can carry tool input.");
    block.input = event.input ?? null;
    block.continuation = event.continuation ?? null;
    block.endedAt = Date.now();
  }

  calls(): LiveCall[] {
    return [...this.blocks.values()].filter((block): block is LiveCall => block.part.kind === "toolcall");
  }

  terminate(termination: ModelTermination, measured: { timing?: RequestTiming | null; usage?: Usage | null; providerResponseId?: string } = {}): ModelCompletion {
    return this.termination = {
      usage: this.finish?.usage ?? measured.usage ?? null, finishReason: this.finish?.reason ?? null,
      rawFinishReason: this.finish?.rawFinishReason ?? null, providerResponseId: this.finish?.responseId ?? measured.providerResponseId ?? null,
      ...(this.finish?.timing ?? measured.timing ? { timing: (this.finish?.timing ?? measured.timing)! } : {}),
      ...(this.extensions.length ? { extensions: this.extensions } : {}), termination,
    };
  }

  /** Preserve model order before any tool runs; pending inputs keep their original position when results arrive. */
  seal(completion: ModelCompletion): void {
    this.termination = completion;
    this.selectContext();
    for (const block of this.blocks.values()) {
      if (block.part.kind === "toolcall") {
        block.published = true;
        this.emitBlock(block, false, null, "tool.begin");
      } else this.emitBlock(block, true);
    }
  }

  /** Project a draft for identity hints without promoting it to executable input. */
  async preview(identity: (name: string, input: ToolCallInput | null) => ToolInvocationInfo): Promise<void> {
    for (const block of this.calls()) {
      if (block.emitted || block.executing) continue;
      if (block.endedAt === null && block.previewText !== block.text) {
        block.previewText = block.text;
        block.previewInput = block.part.inputKind === "freeform"
          ? { kind: "freeform", text: block.text }
          : { kind: "structured", value: previewArguments(block.text) };
      }
      block.invocation = identity(block.part.name, block.input ?? block.previewInput);
    }
  }

  live(): ModelLiveBlock[] {
    return [...this.blocks.values()].filter(block => !block.emitted).map(block => {
      const base = { id: `${this.identity.responseId}:${block.ordinal}`,
        responseId: this.identity.responseId, ordinal: block.ordinal };
      return block.part.kind === "toolcall"
        ? { ...base, kind: "toolcall", name: block.part.name, input: block.input, draft: this.draft(block, block.part.inputKind),
          state: block.executing ? "executing" : block.endedAt !== null ? "ready" : "input", invocation: block.invocation, result: block.result, ...(block.noticeAt === undefined ? {} : { noticeAt: block.noticeAt }) }
        : block.part.kind === "thinking" ? { ...base, kind: "thinking", text: block.text || block.summary, startedAt: block.startedAt, endedAt: block.endedAt }
          : { ...base, kind: "text", text: block.text, endedAt: block.endedAt };
    });
  }

  settle(call: LiveCall, outcome: ToolOutcome): void {
    this.emitBlock(call, true, outcome, call.published ? "tool.complete" : "block");
  }

  prepare(call: LiveCall, info: ToolInvocationInfo): void {
    call.invocation = info;
  }

  start(call: LiveCall, info: ToolInvocationInfo = {}): void {
    call.executing = true;
    call.invocation = info;
    call.result = { kind: "running", data: null };
  }

  notice(call: LiveCall): void {
    call.noticeAt = Date.now();
  }

  publish(call: LiveCall, data: Json): void {
    if (this.finalized || call.emitted || !call.executing) return;
    call.result = { kind: "running", data };
  }

  /** Finalize remaining blocks; mark unfinished text and unexecuted calls incomplete within blocks without a separate terminal record. */
  close(completion?: ModelCompletion | null): void {
    if (this.finalized) return;
    if (completion) this.termination = completion;
    this.selectContext();
    for (const block of this.blocks.values()) {
      if (!block.emitted && !block.published) this.emitBlock(block, block.part.kind !== "toolcall" && block.endedAt !== null);
    }
    this.finalized = true;
  }

  private selectContext(): void {
    if (!this.contextPhantoms || this.phantoms || this.empty) return;
    this.phantoms = new Set(this.contextPhantoms([...this.blocks.values()].map(block => ({
      kind: block.part.kind, generated: block.endedAt !== null,
    }))));
  }

  private draft(block: BufferedBlock, kind: ToolInputDraft["kind"]): ToolInputDraft | null {
    return block.input === null ? { kind, text: block.text } : null;
  }

  private emitBlock(block: BufferedBlock, complete: boolean, outcome: ToolOutcome | null = null,
    type: "block" | "tool.begin" | "tool.complete" = "block"): void {
    if (block.emitted) throw new ModelFailure("protocol", "The response block has already been emitted.");
    const common = { ...this.identity, ordinal: block.ordinal, complete, continuation: block.continuation,
      ...(this.phantoms && { phantom: this.phantoms.has(block.ordinal) }),
      completion: block.ordinal === this.blocks.size - 1 ? this.completion : null,
      startedAt: block.startedAt, endedAt: block.endedAt };
    this.onBlock(block.part.kind === "toolcall"
      ? { ...common, kind: "toolcall" as const, callId: block.part.callId, name: block.part.name,
          input: block.input, draft: this.draft(block, block.part.inputKind), outcome,
          ...(block.invocation ? { invocation: block.invocation } : {}) }
      : block.part.kind === "thinking" ? { ...common, kind: "thinking", text: block.text, summary: block.summary }
        : { ...common, kind: "text", text: block.text }, type);
    if (type !== "tool.begin") block.emitted = true;
  }
}
