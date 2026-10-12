import { describe, expect, it } from "vitest";
import { createMessageDraft } from "./draft.ts";
import type { RendererContentInput } from "@atelier/sdk/renderer";
import type { ContentRef } from "@atelier/sdk/contracts";

const ref: ContentRef = { "$atelier.content": "00000000-0000-4000-8000-000000000001" };
const reader = { read: async () => new Uint8Array(), async *open() {} };
describe("消息文件草稿", () => {
  it("重复取提交输入不重新上传；成功清除草稿，下一次输入使用新的内容作用域", async () => {
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
    await draft.add([new File(["pdf"], "scan.pdf")]);
    expect(scopes).toBe(2);
    expect(draft.parts()).toEqual([{ kind: "file", file: ref, mediaType: "application/pdf", filename: "scan.pdf" }]);
    await draft.close();
  });
  it("上传取消后迟到结果不进入待发送消息，正文保留且可以再次上传", async () => {
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
