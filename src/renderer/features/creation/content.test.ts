import { afterEach, expect, it, vi } from "vitest";
import type { ContentCommand, ContentResult } from "../../../shared/content.ts";
import { contentInput } from "./content.ts";

afterEach(() => vi.unstubAllGlobals());

// docs/content.md：关闭内容作用域取消其在途操作，上传和读取均以取消收束。
// 后台拒绝可能晚于 close 返回；不能把它呈现为普通创建失败。
it.each(["upload.begin", "read.open"] as const)("内容关闭后 %s 的后台拒绝作为取消交付", async operation => {
  let finish!: (result: ContentResult) => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  const execute = vi.fn(async (command: ContentCommand): Promise<ContentResult> => {
    if (command.type === "input.open") return { ok: true, reply: { kind: "input", scopeId: "scope" } };
    if (command.type === operation) {
      started();
      return new Promise(resolve => { finish = resolve; });
    }
    return { ok: true, reply: { kind: "done" } };
  });
  vi.stubGlobal("window", { host: { content: { execute } } });
  const content = contentInput({ resourceKind: "example/document", contractId: "example/create" });
  try {
    const pending = operation === "upload.begin"
      ? content.stage(new Uint8Array([1])) : content.read({ "$atelier.content": "file" });
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await began;
    await content.close();
    finish({ ok: false, error: { code: "unavailable", message: "The content scope is closed or cancelled." } });
    await cancelled;
    expect(execute).toHaveBeenCalledWith({ type: "input.close", scopeId: "scope" });
  } finally { await content.close(); }
});

// 正常作用域中的基础设施错误仍需暴露，不能被取消处理吞掉。
it("内容未关闭时保留后台错误", async () => {
  vi.stubGlobal("window", { host: { content: { execute: async (): Promise<ContentResult> => ({
    ok: false, error: { code: "unavailable", message: "Storage is unavailable." },
  }) } } });
  const content = contentInput({ resourceKind: "example/document", contractId: "example/create" });
  try {
    await expect(content.stage(new Uint8Array([1]))).rejects.toMatchObject({ name: "Error", message: "Storage is unavailable." });
  } finally { await content.close(); }
});
