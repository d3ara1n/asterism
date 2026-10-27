import { describe, expect, it } from "vitest";
import { createMessageDraft, copyDraft } from "./draft.ts";
import type { RendererContentInput } from "@asterism-app/sdk/renderer";
import type { ContentRef } from "@asterism-app/sdk/contracts";

const ref: ContentRef = { "$asterism.content": "00000000-0000-4000-8000-000000000001" };
const reader = { read: async () => new Uint8Array(), async *open() {} };
describe("Message file drafts", () => {
  // Complete the attachment hold handoff before retrieval, restoring all text and file information; saving does not normalize the original text.
  it("Retrieved attachments enter an independent editor hold, and original text, names, and media types can be saved or sent again", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    let closed = false;
    const content: RendererContentInput = { ...reader, stage: async value => {
      expect(new Uint8Array(await (value as Blob).arrayBuffer())).toEqual(bytes);
      return ref;
    }, close: async () => { closed = true; } };
    const parts = [{ kind: "text" as const, text: "  Keep spaces\n" },
      { kind: "file" as const, file: ref, filename: "photo.png", mediaType: "image/png" }];
    const copied = await copyDraft(parts, { ...reader, async *open() { yield bytes; } }, content);
    const draft = createMessageDraft(() => content);
    draft.restore(copied);
    expect(draft.parts(false)).toEqual(parts);
    expect(draft.getSnapshot().files[0]).toMatchObject({ size: 3, part: parts[1] });
    expect(closed).toBe(false);
    draft.lock(true); draft.setText("Changed"); draft.remove(0);
    expect(draft.parts(false)).toEqual(parts);
    draft.lock(false); await draft.close();
    expect(closed).toBe(true);
  });
  // If the handoff is incomplete, the new hold must be released; the caller has not committed the persistent exchange, so the original draft can be retained for retry.
  it("Attachment handoff failure closes the new hold without delivering a partial draft", async () => {
    let closed = false;
    await expect(copyDraft([{ kind: "file", file: ref, mediaType: "image/png" }],
      { ...reader, async *open() { yield new Uint8Array([1]); } },
      { ...reader, stage: async () => { throw new Error("Upload failed"); }, close: async () => { closed = true; } }))
      .rejects.toThrow("Upload failed");
    expect(closed).toBe(true);
  });
  it("Repeated submission-input retrieval does not upload again; success clears the draft, and the next input uses a new content scope", async () => {
    let uploads = 0, closed = 0, scopes = 0;
    const draft = createMessageDraft((): RendererContentInput => {
      scopes++; return { ...reader, async stage() { uploads++; return ref; }, async close() { closed++; } };
    });
    draft.setText("Review");
    await draft.add([new File(["image"], "shot.png", { type: "image/png" })]);
    const first = draft.parts(), scope = draft.content();
    expect(draft.parts()).toEqual(first);
    expect(draft.content()).toBe(scope);
    expect(uploads).toBe(1);
    draft.accepted();
    expect(draft.parts()).toEqual([]);
    expect(closed).toBe(1);
    await draft.add([new File(["webp"], "scan.webp")]);
    expect(scopes).toBe(2);
    expect(draft.parts()).toEqual([{ kind: "file", file: ref, mediaType: "image/webp", filename: "scan.webp" }]);
    await draft.close();
  });
  it("Late upload results after cancellation do not enter the pending message; the body is preserved and can be uploaded again", async () => {
    let finish!: (ref: ContentRef) => void;
    const pending = new Promise<ContentRef>(resolve => { finish = resolve; });
    const draft = createMessageDraft(() => ({ ...reader, stage: async () => pending, close: async () => {} }));
    draft.setText("Keep this text");
    const uploading = draft.add([new File(["image"], "shot.png", { type: "image/png" })]);
    expect(draft.getSnapshot().uploading).toBe(true);
    draft.cancelUpload(); finish(ref); await uploading;
    expect(draft.parts()).toEqual([{ kind: "text", text: "Keep this text" }]);
    expect(draft.getSnapshot()).toMatchObject({ uploading: false, error: null });
    await draft.add([new File(["image"], "shot.png", { type: "image/png" })]);
    expect(draft.getSnapshot().files).toHaveLength(1);
    await draft.close();
  });
});
