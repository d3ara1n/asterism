import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { modelInputLimits, pluginNamespace, type MessagingMessage } from "@asterism-app/sdk/contracts";
import { definePlugin, type PluginContext } from "@asterism-app/sdk/runtime";
import { BuiltinApplicationService } from "../testing.ts";
import { Chat, CreateChat, ReadChat, chatMessageListSchema, type ChatFilePart } from "./contract.ts";
import { chatMessage, messageInputParts } from "./content.ts";
import { projectInputMessage } from "../agent/input-message.ts";

const roots: string[] = [], apps: BuiltinApplicationService[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr6sAAAAASUVORK5CYII=", "base64");

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "asterism-chat-content-")); roots.push(root);
  let context!: PluginContext, opened = 0;
  const source: { bytes: Uint8Array; error?: string } = { bytes: png };
  const message: MessagingMessage = { id: "message", sender: { id: "user", name: "Ada", role: "participant" }, sentAt: "2026-01-01T00:00:00Z",
    parts: [{ kind: "text", text: "Inspect this" }, { kind: "file", id: "image", filename: "image.png", mediaType: "image/unknown" }] };
  const app = new BuiltinApplicationService(root, { plugins: [definePlugin({ namespace: pluginNamespace("test.attachments"), setup(plugin) {
    context = plugin;
    return { messagingProviders: [{ id: "test-attachments", label: "Test attachments", settings: [], async create() { return {
      identity: "Test bot", async receive({ ready }) { ready(); },
      async listConversations() { return { conversations: [], truncated: false }; },
      async readMessages() { return { messages: [message], truncated: false }; },
      async sendMessage() { return message; },
      async *openFile() { opened++; if (source.error) throw new Error(source.error); yield source.bytes; },
    }; } }] };
  } })] }); apps.push(app);
  const configured = await app.configuration.execute({ type: "messaging.save", id: null,
    value: { name: "Test", providerId: "test-attachments", enabled: true, settings: {} }, secrets: {} });
  const sessionId = app.sessions.tree.create("Images");
  await app.sessions.execute({ type: "resource.create", sessionId, kind: Chat.kind, creation: { id: CreateChat.id },
    input: { connectionId: configured.savedId!, conversationId: "conversation", title: "Chat" }, position: { x: 0, y: 0 } });
  const object = { sessionId, id: app.sessions.current(sessionId).workbench.objects.find(item => item.kind === Chat.kind)!.id, kind: Chat.kind };
  const read = async () => chatMessageListSchema.parse(await app.sessions.calls.invoke(ReadChat.id, null, { object }, null));
  /** Event input assembly as the Chat performs it: attachments resolve through the Chat's FileRef. */
  const input = (values: readonly MessagingMessage[] = [message]) => context.content.withScope(async content => {
    const parts = await messageInputParts(values.flatMap(value => chatMessage(object, value).parts), (part: ChatFilePart) => context.files.open(part.ref), content, new AbortController().signal);
    const files = await Promise.all(parts.map(async part => part.kind === "file" ? Buffer.from(await content.read(part.file)) : null));
    return { parts, files };
  });
  return { context, object, read, input, source, message, opened: () => opened };
}
async function collect(stream: AsyncIterable<Uint8Array>) { const chunks: Uint8Array[] = []; for await (const chunk of stream) chunks.push(chunk); return Buffer.concat(chunks); }

describe("Chat attachment content", () => {
  it("addresses attachments in reads without fetching them, and resolves the reference through the provider", async () => {
    const f = await setup();
    const part = (await f.read()).messages[0]!.parts[1]!;
    expect(part).toMatchObject({ kind: "file", id: "image", ref: { source: f.object, locator: { messageId: "message", fileId: "image" } } });
    expect(f.opened()).toBe(0);
    if (part.kind !== "file") throw new Error("Expected an attachment");
    expect(await collect(f.context.files.open(part.ref))).toEqual(png);
    expect(f.opened()).toBe(1);
  });
  it("attaches event images as captured files identified by their bytes, keeping the reference for the model", async () => {
    const f = await setup(), { parts, files } = await f.input();
    expect(parts).toMatchObject([{ kind: "text", text: "Inspect this" },
      { kind: "file", mediaType: "image/png", size: png.length, filename: "image.png", ref: { source: f.object } }]);
    expect(files[1]).toEqual(png);
    const projected = projectInputMessage({ parts, sender: { kind: "event", resource: f.object, name: "Chat" } }).parts;
    expect(projected.filter(part => part.kind === "file")).toHaveLength(1);
    // Event text is escaped inside the envelope; the reference metadata still accompanies the captured file.
    expect(projected.some(part => part.kind === "text" && part.text.includes("file-reference"))).toBe(true);
  });
  it("stops capture at the model file limit and keeps the reference with the reason", async () => {
    const f = await setup();
    f.source.bytes = Buffer.concat([png, Buffer.alloc(modelInputLimits.file)]);
    const { parts } = await f.input();
    expect(parts.slice(1)).toMatchObject([{ kind: "file-reference", ref: { source: f.object } }, { kind: "text", text: expect.stringContaining("size limit") }]);
  });
  it("does not fetch an image whose declared size already exceeds the limit", async () => {
    const f = await setup(), [text, file] = f.message.parts;
    const { parts } = await f.input([{ ...f.message, parts: [text!, { ...file!, size: modelInputLimits.file + 1 } as typeof file & object] }]);
    expect(parts.slice(1).map(part => part.kind)).toEqual(["file-reference", "text"]);
    expect(f.opened()).toBe(0);
  });
  it("keeps the reference and states the failure when retrieval fails or the bytes are not a supported image", async () => {
    const f = await setup();
    f.source.error = "Attachment removed";
    expect((await f.input()).parts.slice(1)).toMatchObject([{ kind: "file-reference" }, { kind: "text", text: expect.stringContaining("Attachment removed") }]);
    delete f.source.error; f.source.bytes = Buffer.from("not an image");
    expect((await f.input()).parts.slice(1)).toMatchObject([{ kind: "file-reference" }, { kind: "text", text: expect.stringContaining("supported image") }]);
  });
  it("shares the input image count across messages in one batch and keeps each file's message identity", async () => {
    const f = await setup();
    const values = Array.from({ length: modelInputLimits.files + 1 }, (_, index) => ({ ...f.message, id: `item-${index}` }));
    const { parts } = await f.input(values);
    expect(parts.filter(part => part.kind === "file")).toHaveLength(modelInputLimits.files);
    expect(f.opened()).toBe(modelInputLimits.files);
    expect(parts.find(part => part.kind === "file-reference")).toMatchObject({
      ref: { locator: { messageId: `item-${modelInputLimits.files}`, fileId: "image" } },
    });
  });
});
