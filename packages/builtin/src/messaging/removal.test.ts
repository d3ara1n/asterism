import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pluginNamespace, resourceCall, type Json, type ResourceRef } from "@asterism-app/sdk/contracts";
import { definePlugin } from "@asterism-app/sdk/runtime";
import { BuiltinApplicationService } from "../testing.ts";
import { CallPeer } from "../../../../src/runtime/call-peer.ts";
import type { CallFrame } from "../../../../src/shared/plugin-calls.ts";
import { BrowseConversations, Chat, ChatView, CreateChat, ReadChat, SendChat } from "./contract.ts";

const roots: string[] = [], apps: BuiltinApplicationService[] = [];
afterEach(async () => {
  try { for (const app of apps.splice(0)) await app.close(); }
  finally { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); }
});

async function call(app: BuiltinApplicationService, contract: string, input: Json, object?: ResourceRef) {
  let deliver!: (frame: CallFrame) => void;
  const response = new Promise<CallFrame>(resolve => { deliver = resolve; });
  const peer = new CallPeer(app.sessions.calls, deliver);
  try {
    peer.receive({ type: "invoke", id: randomUUID(), contract, input, ...(object ? { object } : {}) });
    return await response;
  } finally { peer.close(); }
}

describe("Removed messaging connections", () => {
  it("reports unavailable chats as operation errors and permits resource removal and application close", async () => {
    const root = mkdtempSync(join(tmpdir(), "asterism-messaging-removal-")); roots.push(root);
    let announceStarted!: () => void, announceForgotten!: () => void;
    const started = new Promise<void>(resolve => { announceStarted = resolve; });
    const forgotten = new Promise<void>(resolve => { announceForgotten = resolve; });
    let stopped = false, forgottenAfterStop = false, sends = 0;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = new BuiltinApplicationService(root, { plugins: [definePlugin({ namespace: pluginNamespace("test.messaging-removal"), setup() {
      return { messagingProviders: [{ id: "test-messaging-removal", label: "Test messaging", settings: [],
        forget() { forgottenAfterStop = stopped; announceForgotten(); },
        async create() { return {
          identity: "Test bot",
          async receive({ signal, ready }) {
            ready(); announceStarted();
            await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
            stopped = true;
          },
          async listConversations() { return { conversations: [], truncated: false }; },
          async readMessages() { return { messages: [], truncated: false }; },
          async sendMessage() { sends++; throw new Error("Sending is not part of this fixture."); },
        }; },
      }] };
    } })] }); apps.push(app);
    const saved = await app.configuration.execute({ type: "messaging.save", id: null,
      value: { name: "Bot", providerId: "test-messaging-removal", enabled: true, settings: {} }, secrets: {} });
    const connectionId = saved.savedId!;
    await started;
    const chats: ResourceRef[] = [];
    for (const title of ["First session", "Second session"]) {
      const sessionId = app.sessions.tree.create(title);
      await app.sessions.execute({ type: "resource.create", sessionId, kind: Chat.kind, creation: { id: CreateChat.id },
        input: { connectionId, conversationId: "conversation", title: "Chat" }, position: { x: 0, y: 0 } });
      const id = app.sessions.current(sessionId).workbench.objects.find(item => item.kind === Chat.kind)!.id;
      chats.push({ sessionId, id, kind: Chat.kind });
    }
    expect(await call(app, ReadChat.id, null, chats[0])).toMatchObject({ type: "result", data: { messages: [] } });
    await app.configuration.execute({ type: "remove", kind: "messaging", id: connectionId });
    await forgotten;
    expect(forgottenAfterStop).toBe(true);
    for (const object of chats) {
      const card = app.sessions.current(object.sessionId).workbench.objects.find(item => item.id === object.id)!;
      expect(ChatView.schema.parse(card.presentation.data).connection).toBeNull();
      expect(await call(app, ReadChat.id, null, object)).toMatchObject({ type: "error", code: "unavailable",
        message: `Messaging connection '${connectionId}' is unavailable.` });
    }
    expect(await call(app, BrowseConversations.id, { connectionId })).toMatchObject({ type: "error", code: "unavailable" });
    const first = chats[0]!;
    await expect(app.sessions.execute({ type: "resource.command", sessionId: first.sessionId, objectId: first.id,
      command: resourceCall(SendChat, { text: "Hello" }) })).rejects.toMatchObject({ code: "unavailable" });
    expect(sends).toBe(0);
    await app.sessions.execute({ type: "object.remove", sessionId: first.sessionId, objectId: first.id });
    expect(app.sessions.current(first.sessionId).workbench.objects.some(item => item.id === first.id && !item.retiring)).toBe(false);
    expect(app.execute({ type: "workspace.prepare-close" }).disposalWarnings).toEqual([]);
    await app.close();
    apps.splice(apps.indexOf(app), 1);
    expect(log).not.toHaveBeenCalled();
  });
});
