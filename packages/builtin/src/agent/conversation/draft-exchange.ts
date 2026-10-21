import type { z } from "zod";
import type { RendererContentInput, RendererReceipt } from "@atelier/sdk/renderer";
import type { ExchangeAgentDraft } from "../drafts-contract.ts";
import type { CopiedDraft, MessageDraft } from "./draft.ts";

type Input = z.infer<typeof ExchangeAgentDraft.schema>;
interface Exchange { input: Input; incoming: CopiedDraft; replacement: CopiedDraft | null }

/** 不确定回执保留原操作及两侧附件，恢复入口独立于可能已经移除的持久条目。 */
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
      } else if (["draft_changed", "invalid_request", "not_found"].includes(result.error.code)) {
        // 业务拒绝发生在资源动作队列中；旧提交若已生效会先命中幂等受理。
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
