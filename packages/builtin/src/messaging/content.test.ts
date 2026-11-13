import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pluginNamespace, type MessagingMessage } from "@asterism-app/sdk/contracts";
import { definePlugin, type PluginContext } from "@asterism-app/sdk/runtime";
import { BuiltinApplicationService } from "../testing.ts";
import { Chat, CreateChat, ReadChat, chatMessageListSchema, type ChatFilePart } from "./contract.ts";
import { chatMessage, chatMessageParts, chatMessagesToModel, messageInputParts } from "./content.ts";
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
    value: { name: "Test", providerId: "test-attachments", enabled: true, settings: {} } });
  const sessionId = app.sessions.tree.create("Images");
  await app.sessions.execute({ type: "resource.create", sessionId, kind: Chat.kind, creation: { id: CreateChat.id },
    input: { connectionId: configured.savedId!, conversationId: "conversation", title: "Chat" }, position: { x: 0, y: 0 } });
  const object = { sessionId, id: app.sessions.current(sessionId).workbench.objects.find(item => item.kind === Chat.kind)!.id, kind: Chat.kind };
  const read = async () => chatMessageListSchema.parse(await app.sessions.calls.invoke(ReadChat.id, null, { object }, null));
  /** Event input assembly as the Chat performs it: attachments resolve through the Chat's FileRef. */
  const input = (values: readonly MessagingMessage[] = [message]) => context.content.withScope(async content => {
    const parts = await messageInputParts(values.flatMap(value => chatMessageParts(chatMessage(object, value))), (part: ChatFilePart) => context.files.open(part.ref), content, new AbortController().signal);
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
  it("addresses an embedded quote's image through the reply and captures its bytes without an original message", async () => {
    const f = await setup();
    f.message.replyTo = "unseen-original";
    f.message.quote = { parts: [{ kind: "text", text: "Quoted caption" }, f.message.parts[1]!] };
    f.message.parts = [{ kind: "text", text: "Describe the quoted image" }];
    const read = (await f.read()).messages[0]!;
    const image = read.quote!.parts[1]!;
    if (image.kind !== "file") throw new Error("Expected a quoted image");
    expect(image.ref.locator).toEqual({ messageId: "message", fileId: "image" });
    expect(await collect(f.context.files.open(image.ref))).toEqual(png);
    const { parts, files } = await f.input();
    const captured = parts.findIndex(part => part.kind === "file");
    expect(files[captured]).toEqual(png);
    expect(parts[captured]).toMatchObject({ mediaType: "image/png", ref: image.ref });
    const texts = parts.flatMap(part => part.kind === "text" ? [part.text] : []);
    expect(texts).toEqual(["Describe the quoted image", "Quoted content (unseen-original):", "Quoted caption", "End quoted content."]);
    const projected = chatMessagesToModel([read]);
    expect(projected.some(part => part.kind === "file")).toBe(false);
    expect(projected.some(part => part.kind === "text" && part.text.includes('"messageId":"message"'))).toBe(true);
  });
  it("keeps the reference and states the failure when retrieval fails or the bytes are not a supported image", async () => {
    const f = await setup();
    f.source.error = "Attachment removed";
    expect((await f.input()).parts.slice(1)).toMatchObject([{ kind: "file-reference" }, { kind: "text", text: expect.stringContaining("Attachment removed") }]);
    delete f.source.error; f.source.bytes = Buffer.from("not an image");
    expect((await f.input()).parts.slice(1)).toMatchObject([{ kind: "file-reference" }, { kind: "text", text: expect.stringContaining("supported image") }]);
  });
  it("captures images across a batch without dropping later files or losing message identity", async () => {
    const f = await setup();
    const values = Array.from({ length: 21 }, (_, index) => ({ ...f.message, id: `item-${index}` }));
    const { parts } = await f.input(values);
    expect(parts.filter(part => part.kind === "file")).toHaveLength(21);
    expect(f.opened()).toBe(21);
    expect(parts.flatMap(part => part.kind === "file" ? [part.ref?.locator] : []))
      .toEqual(values.map(value => ({ messageId: value.id, fileId: "image" })));
  });
});
