import { describe, expect, it } from "vitest";
import type { RendererContentInput } from "@atelier/sdk/renderer";
import type { ModelInputPart } from "@atelier/sdk/contracts";
import { DraftExchange } from "./draft-exchange";
import { createMessageDraft, type CopiedDraft } from "./draft";

const content = (): RendererContentInput => ({
  read: async () => new Uint8Array(), async *open() {},
  stage: async () => ({ "$atelier.content": "00000000-0000-4000-8000-000000000001" }), close: async () => {},
});

describe("草稿交换受理确认", () => {
  // docs/workbench.md：条目已经移除但回执丢失时，恢复入口仍保留原操作和附件，重试不再次交换。
  it("未知回执后编辑器保持锁定，以同一提交重试并恢复已取出的完整草稿", async () => {
    const editor = createMessageDraft(content);
    const file: Extract<ModelInputPart, { kind: "file" }> = {
      kind: "file", file: { "$atelier.content": "00000000-0000-4000-8000-000000000001" }, mediaType: "image/png", filename: "a.png",
    };
    const incoming: CopiedDraft = { parts: [{ kind: "text", text: "Original" }, file], text: "Original",
      files: [{ part: file, size: 3 }], content: content() };
    const exchange = new DraftExchange(editor, () => {});
    const input = { submissionId: crypto.randomUUID(), id: crypto.randomUUID(), revision: 0, replacement: null };
    exchange.begin({ input, incoming, replacement: null });
    let committed: string | null = null, writes = 0;
    const invoke = async (value: { submissionId: string }) => {
      if (committed === value.submissionId) return { ok: true as const };
      committed = value.submissionId; writes++;
      return { ok: false as const, error: { code: "unavailable", message: "Receipt lost" } };
    };
    expect((await exchange.retry(invoke)).ok).toBe(false);
    expect(exchange.pending?.input).toBe(input);
    expect(editor.getSnapshot()).toMatchObject({ text: "", locked: true });
    expect((await exchange.retry(invoke)).ok).toBe(true);
    expect(writes).toBe(1);
    expect(exchange.pending).toBeNull();
    expect(editor.parts(false)).toEqual(incoming.parts);
    expect(editor.getSnapshot().locked).toBe(false);
    await editor.close();
  });

  // 明确的修订冲突表示资源动作未交换；保留编辑器原文并解除锁定，不无限重试已发送条目。
  it("条目过期的明确拒绝保留编辑器并结束待确认操作", async () => {
    const editor = createMessageDraft(content); editor.setText("Editor");
    const exchange = new DraftExchange(editor, () => {});
    exchange.begin({ input: { submissionId: crypto.randomUUID(), id: crypto.randomUUID(), revision: 0, replacement: null },
      incoming: { parts: [{ kind: "text", text: "Old" }], text: "Old", files: [], content: content() }, replacement: null });
    await exchange.retry(async () => ({ ok: false, error: { code: "draft_changed", message: "Already sent" } }));
    expect(exchange.pending).toBeNull();
    expect(editor.getSnapshot()).toMatchObject({ text: "Editor", locked: false });
    await editor.close();
  });
});
