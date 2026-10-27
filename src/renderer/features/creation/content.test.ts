import { afterEach, expect, it, vi } from "vitest";
import type { ContentCommand, ContentResult } from "../../../shared/content.ts";
import { contentInput } from "./content.ts";

const backend = vi.hoisted(() => ({ execute: async (_command: unknown): Promise<unknown> => { throw new Error("Unset."); } }));
vi.mock("../../runtime", () => ({ runtime: { content: { execute: (command: unknown) => backend.execute(command) } } }));

afterEach(() => { backend.execute = async () => { throw new Error("Unset."); }; });

// Closing a content scope cancels its in-flight operations; uploads and reads both settle as cancelled.
// Backend rejection may arrive after close returns; it must not appear as an ordinary creation failure.
it.each(["upload.begin", "read.open"] as const)("delivers backend rejection of %s as cancellation after content is closed", async operation => {
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
  backend.execute = execute as typeof backend.execute;
  const content = contentInput({ resourceKind: "example/document", contractId: "example/create" });
  try {
    const pending = operation === "upload.begin"
      ? content.stage(new Uint8Array([1])) : content.read({ "$asterism.content": "file" });
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await began;
    await content.close();
    finish({ ok: false, error: { code: "unavailable", message: "The content scope is closed or cancelled." } });
    await cancelled;
    expect(execute).toHaveBeenCalledWith({ type: "input.close", scopeId: "scope" });
  } finally { await content.close(); }
});

// Infrastructure errors in an active scope must remain exposed, not swallowed by cancellation handling.
it("preserves backend errors while content remains open", async () => {
  backend.execute = async (): Promise<ContentResult> => ({
    ok: false, error: { code: "unavailable", message: "Storage is unavailable." },
  });
  const content = contentInput({ resourceKind: "example/document", contractId: "example/create" });
  try {
    await expect(content.stage(new Uint8Array([1]))).rejects.toMatchObject({ name: "Error", message: "Storage is unavailable." });
  } finally { await content.close(); }
});
