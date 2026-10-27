import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import type { RendererContentInput } from "@asterism/sdk/renderer";
import type { ModelInputPart } from "@asterism/sdk/contracts";
import { DraftExchange } from "./draft-exchange";
import { createMessageDraft, type CopiedDraft } from "./draft";

const content = (): RendererContentInput => ({
  read: async () => new Uint8Array(), async *open() {},
  stage: async () => ({ "$asterism.content": "00000000-0000-4000-8000-000000000001" }), close: async () => {},
});

describe("Draft exchange acceptance confirmation", () => {
  // If the item has been removed but the receipt is lost, the recovery entry retains the original operation and attachments; retrying does not exchange again.
  it("Keeps the editor locked after an unknown receipt, retries the same submission, and restores the complete retrieved draft", async () => {
    const editor = createMessageDraft(content);
    const file: Extract<ModelInputPart, { kind: "file" }> = {
      kind: "file", file: { "$asterism.content": "00000000-0000-4000-8000-000000000001" }, mediaType: "image/png", filename: "a.png",
    };
    const incoming: CopiedDraft = { parts: [{ kind: "text", text: "Original" }, file], text: "Original",
      files: [{ part: file, size: 3 }], content: content() };
    const exchange = new DraftExchange(editor, () => {});
    const input = { submissionId: nanoid(16), id: nanoid(16), replacement: null };
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

  // An explicit revision conflict means the resource action did not exchange drafts; preserve the editor text and unlock it instead of retrying an already sent item indefinitely.
  it("An explicit rejection for a missing item preserves the editor and ends the operation awaiting confirmation", async () => {
    const editor = createMessageDraft(content); editor.setText("Editor");
    const exchange = new DraftExchange(editor, () => {});
    exchange.begin({ input: { submissionId: nanoid(16), id: nanoid(16), replacement: null },
      incoming: { parts: [{ kind: "text", text: "Old" }], text: "Old", files: [], content: content() }, replacement: null });
    await exchange.retry(async () => ({ ok: false, error: { code: "not_found", message: "Already sent" } }));
    expect(exchange.pending).toBeNull();
    expect(editor.getSnapshot()).toMatchObject({ text: "Editor", locked: false });
    await editor.close();
  });
});
