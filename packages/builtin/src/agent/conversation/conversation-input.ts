import type { z } from "zod";
import type { AgentInputPart } from "@asterism-app/builtin-api/contracts";
import type { ContentReader, RendererContentInput, RendererReceipt } from "@asterism-app/sdk/renderer";
import type { ExchangeAgentDraft } from "../drafts-contract.ts";
import { copyDraft, createMessageDraft, type CopiedDraft, type MessageDraft } from "./draft.ts";
import { SubmissionIdentity } from "./submission.ts";

type ExchangeInput = z.infer<typeof ExchangeAgentDraft.schema>;
type InvokeExchange = (input: ExchangeInput, content?: RendererContentInput) => Promise<RendererReceipt>;
interface Exchange { input: ExchangeInput; incoming: CopiedDraft; replacement: CopiedDraft | null }
type InputPhase = "idle" | "working" | "unconfirmed" | "retrying";
type TransferKey = "save" | "take" | "exchange";

/** Retained input lifetime: one owner for operation admission, editor locking, exchange recovery, and their notifications. */
export class ConversationInput {
  readonly draft: MessageDraft;
  readonly submission = new SubmissionIdentity();
  private phase: InputPhase = "idle";
  private pending: Exchange | null = null;
  private closed = false;
  private readonly transfers = new Map<TransferKey, { signature: string; value: CopiedDraft }>();
  private readonly listeners = new Set<() => void>();

  constructor(createContent: () => RendererContentInput) {
    this.draft = createMessageDraft(createContent);
  }

  readonly getSnapshot = () => this.phase;
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  private change(phase: InputPhase): void {
    this.phase = phase;
    this.draft.lock(phase !== "idle");
    for (const listener of this.listeners) listener();
  }

  private async operate<T>(phase: "working" | "retrying", work: () => Promise<T>): Promise<T> {
    this.change(phase);
    try { return await work(); }
    finally { this.change(this.pending ? "unconfirmed" : "idle"); }
  }

  async mutate(work: () => Promise<boolean>): Promise<boolean> {
    if (this.closed || this.phase !== "idle" || this.draft.getSnapshot().uploading) return false;
    return this.operate("working", work);
  }

  async transfer(key: TransferKey, parts: readonly AgentInputPart[], source: ContentReader, input: () => RendererContentInput): Promise<CopiedDraft> {
    const signature = JSON.stringify(parts), existing = this.transfers.get(key);
    if (existing?.signature === signature) return existing.value;
    if (existing) { this.transfers.delete(key); await existing.value.content.close(); }
    const value = await copyDraft(parts, source, input());
    if (this.closed) { await value.content.close(); throw new Error("The message editor is closed."); }
    this.transfers.set(key, { signature, value });
    return value;
  }

  clearTransfers(keep?: RendererContentInput): void {
    for (const item of this.transfers.values()) if (item.value.content !== keep) void item.value.content.close();
    this.transfers.clear();
  }

  /** Called inside the admitted mutation, after both content holds are established. */
  async exchange(value: Exchange, invoke: InvokeExchange): Promise<RendererReceipt> {
    if (this.pending) throw new Error("A draft exchange is awaiting confirmation.");
    this.pending = value;
    return this.confirmExchange(invoke);
  }

  async retryExchange(invoke: InvokeExchange): Promise<RendererReceipt | null> {
    if (this.closed || this.phase !== "unconfirmed") return null;
    return this.operate("retrying", () => this.confirmExchange(invoke));
  }

  private async confirmExchange(invoke: InvokeExchange): Promise<RendererReceipt> {
    const exchange = this.pending!;
    const result = await invoke(exchange.input, exchange.replacement?.content);
    if (result.ok) {
      this.pending = null;
      this.submission.accepted();
      this.clearTransfers(exchange.incoming.content);
      this.draft.restore(exchange.incoming);
    } else if (["invalid_request", "not_found"].includes(result.error.code)) {
      // Business rejection occurs in the resource action queue; an earlier submission that took effect first matches idempotent acceptance.
      this.pending = null;
      this.clearTransfers();
    }
    // Other receipts and transport exceptions retain the original operation and both holds for explicit retry.
    return result;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.draft.close();
    await Promise.all([...this.transfers.values()].map(item => item.value.content.close()));
    this.transfers.clear();
  }
}
