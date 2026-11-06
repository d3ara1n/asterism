import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import type { ContentReader, RendererContentInput } from "@asterism-app/sdk/renderer";
import type { ModelInputPart } from "@asterism-app/sdk/contracts";
import { ConversationInput } from "./conversation-input";

const ref = { "$asterism.content": "00000000-0000-4000-8000-000000000001" };
const reader: ContentReader = { read: async () => new Uint8Array([1, 2, 3]), async *open() { yield new Uint8Array([1, 2, 3]); } };
function setup() {
  const holds: { closed: boolean }[] = [];
  const content = (): RendererContentInput => {
    const hold = { closed: false }; holds.push(hold);
    return { ...reader, stage: async () => ref, close: async () => { hold.closed = true; } };
  };
  return { input: new ConversationInput(content), content, holds };
}

// These cases cover the input owner's admission/recovery boundary, rather than mounting conversation controls.
describe("Conversation input operations", () => {
  it("Retains both exchange holds after a lost receipt, blocks other mutations, and notifies retry state without changing the editor lock", async () => {
    const { input, content, holds } = setup();
    input.draft.setText("Replacement");
    await input.draft.add([new File(["old"], "old.png", { type: "image/png" })]);
    const file: Extract<ModelInputPart, { kind: "file" }> = { kind: "file", file: ref, mediaType: "image/png", filename: "a.png" };
    const incoming = await input.transfer("take", [{ kind: "text", text: "Original" }, file], reader, content);
    const replacement = await input.transfer("exchange", input.draft.parts(false), input.draft.content(), content);
    const operation = { input: { submissionId: nanoid(16), id: nanoid(16), replacement: replacement.parts }, incoming, replacement };
    const observed: { phase: string; locked: boolean }[] = [];
    const unsubscribe = input.subscribe(() => observed.push({ phase: input.getSnapshot(), locked: input.draft.getSnapshot().locked }));
    let committed: string | null = null, writes = 0;
    const invoke = async (value: { submissionId: string }) => {
      if (committed === value.submissionId) return { ok: true as const };
      committed = value.submissionId; writes++;
      return { ok: false as const, error: { code: "unavailable", message: "Receipt lost" } };
    };
    expect(await input.mutate(async () => (await input.exchange(operation, invoke)).ok)).toBe(false);
    expect(input.getSnapshot()).toBe("unconfirmed");
    expect(holds.map(hold => hold.closed)).toEqual([false, false, false]);
    let entered = false;
    expect(await input.mutate(async () => { entered = true; return true; })).toBe(false);
    expect(entered).toBe(false);
    input.draft.setText("Changed");
    expect(input.draft.getSnapshot().text).toBe("Replacement");
    expect((await input.retryExchange(invoke))?.ok).toBe(true);
    expect(writes).toBe(1);
    expect(input.draft.parts(false)).toEqual(incoming.parts);
    // The incoming hold becomes the editor's hold; the previous editor and exchange-copy holds are released.
    expect(holds.map(hold => hold.closed)).toEqual([true, false, true]);
    expect(observed).toEqual([
      { phase: "working", locked: true },
      { phase: "unconfirmed", locked: true },
      { phase: "retrying", locked: true },
      { phase: "idle", locked: false },
    ]);
    unsubscribe();
    await input.close();
    expect(holds.map(hold => hold.closed)).toEqual([true, true, true]);
  });

  it("An explicit rejection for a missing draft preserves the editor, releases copied content, and ends recovery", async () => {
    const { input, content, holds } = setup();
    input.draft.setText("Editor");
    const incoming = await input.transfer("take", [{ kind: "text", text: "Old" }], reader, content);
    const result = await input.mutate(async () => (await input.exchange({
      input: { submissionId: nanoid(16), id: nanoid(16), replacement: null }, incoming, replacement: null,
    }, async () => ({ ok: false, error: { code: "not_found", message: "Already sent" } }))).ok);
    expect(result).toBe(false);
    expect(input.getSnapshot()).toBe("idle");
    expect(input.draft.getSnapshot()).toMatchObject({ text: "Editor", locked: false });
    expect(holds.map(hold => hold.closed)).toEqual([true]);
    expect(await input.retryExchange(async () => { throw new Error("No exchange should remain."); })).toBeNull();
    await input.close();
  });

  it("Transport exceptions keep the same exchange available across failed retries", async () => {
    const { input, content } = setup();
    input.draft.setText("Editor");
    const incoming = await input.transfer("take", [{ kind: "text", text: "Original" }], reader, content);
    const operation = { input: { submissionId: nanoid(16), id: nanoid(16), replacement: null }, incoming, replacement: null };
    const failure = new Error("Connection closed");
    await expect(input.mutate(async () => (await input.exchange(operation, async () => { throw failure; })).ok)).rejects.toBe(failure);
    expect(input.getSnapshot()).toBe("unconfirmed");
    await expect(input.retryExchange(async () => { throw failure; })).rejects.toBe(failure);
    expect(input.getSnapshot()).toBe("unconfirmed");
    expect(input.draft.getSnapshot()).toMatchObject({ text: "Editor", locked: true });
    let retried: unknown;
    await input.retryExchange(async value => { retried = value; return { ok: true }; });
    expect(retried).toBe(operation.input);
    expect(input.getSnapshot()).toBe("idle");
    expect(input.draft.getSnapshot()).toMatchObject({ text: "Original", locked: false });
    await input.close();
  });

  it("A failed ordinary mutation rejects reentry and unlocks without inventing exchange recovery", async () => {
    const { input } = setup();
    input.draft.setText("Unsent");
    const failure = new Error("Submission failed");
    await expect(input.mutate(async () => {
      let entered = false;
      expect(await input.mutate(async () => { entered = true; return true; })).toBe(false);
      expect(entered).toBe(false);
      input.draft.setText("Changed");
      throw failure;
    })).rejects.toBe(failure);
    expect(input.getSnapshot()).toBe("idle");
    expect(input.draft.getSnapshot()).toMatchObject({ text: "Unsent", locked: false });
    input.draft.setText("Editable again");
    expect(input.draft.getSnapshot().text).toBe("Editable again");
    await input.close();
  });
});
