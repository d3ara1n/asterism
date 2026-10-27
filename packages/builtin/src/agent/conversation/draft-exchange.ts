import type { z } from "zod";
import type { RendererContentInput, RendererReceipt } from "@asterism/sdk/renderer";
import type { ExchangeAgentDraft } from "../drafts-contract.ts";
import type { CopiedDraft, MessageDraft } from "./draft.ts";

type Input = z.infer<typeof ExchangeAgentDraft.schema>;
interface Exchange { input: Input; incoming: CopiedDraft; replacement: CopiedDraft | null }

/** An uncertain receipt retains the original operation and attachments on both sides; recovery is independent of the persistent item, which may already have been removed. */
export class DraftExchange {
  pending: Exchange | null = null;
  working = false;
  constructor(private readonly editor: MessageDraft, private readonly release: (keep?: RendererContentInput) => void) {}
  begin(value: Exchange): void {
    if (this.pending) throw new Error("A draft exchange is awaiting confirmation.");
    this.pending = value;
    this.editor.lock(true);
  }
  async retry(invoke: (input: Input, content?: RendererContentInput) => Promise<RendererReceipt>): Promise<RendererReceipt> {
    if (!this.pending || this.working) throw new Error("The draft exchange is unavailable.");
    const exchange = this.pending;
    this.working = true;
    this.editor.lock(true);
    try {
      const result = await invoke(exchange.input, exchange.replacement?.content);
      if (result.ok) {
        this.pending = null;
        this.release(exchange.incoming.content);
        this.editor.restore(exchange.incoming);
      } else if (["invalid_request", "not_found"].includes(result.error.code)) {
        // Business rejection occurs in the resource action queue; an earlier submission that already took effect first matches idempotent acceptance.
        this.pending = null;
        this.release();
      }
      return result;
    } finally {
      this.working = false;
      this.editor.lock(this.pending !== null);
    }
  }
}
