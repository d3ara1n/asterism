import { afterEach, describe, expect, it } from "vitest";
import type { MessagingConnection } from "@asterism-app/sdk/contracts";
import { MessagingError, type MessagingInstance, type MessagingProviderDefinition } from "@asterism-app/sdk/runtime";
import { MessagingRegistry, retryDelay } from "./messaging.ts";
import { RunLifecycle } from "../plugins/lifecycle.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const textSetting = (key: string) => ({ key, kind: "text" as const, label: key, required: true });
function instance(name: string, overrides: Partial<MessagingInstance> = {}): MessagingInstance {
  return {
    identity: name,
    async receive({ ready }) { ready(); },
    async listConversations() { return { conversations: [{ conversationId: "chat", title: name, kind: "private" }], truncated: false }; },
    async readMessages() { return { messages: [], truncated: false }; },
    async sendMessage(input) { return { id: "sent", parts: input.parts.filter(part => part.kind === "text"), sender: { id: "bot", name, role: "self" }, sentAt: "2026-01-01T00:00:00Z" }; },
    ...overrides,
  };
}
function setup(initial: MessagingConnection, delay: typeof retryDelay = retryDelay) {
  let state = initial;
  const life = new RunLifecycle(() => {});
  const registry = new MessagingRegistry({ list: () => [state], credential: async value => value, changed() {} }, delay);
  cleanups.push(async () => { registry.close(); await life.close(); });
  return { registry, life, set(next: MessagingConnection) { state = next; } };
}
/** Resolve once the connection reaches a status; status changes are announced through connection listeners. */
function status(registry: MessagingRegistry, id: string, expected: string) {
  return new Promise<void>(resolve => {
    const check = () => { if (registry.connections().find(item => item.id === id)?.status === expected) { release(); resolve(); } };
    const release = registry.subscribeConnections(check);
    check();
  });
}

describe("Messaging retry policy", () => {
  // Terminal provider errors must stop the receive loop; transient failures back off without growing past the cap.
  it("stops on terminal codes, honours provider delays, and caps exponential backoff", () => {
    expect(retryDelay(new MessagingError("unavailable", "token rejected"), 1)).toBeNull();
    expect(retryDelay(new MessagingError("request_failed", "rate limited", { retryAfterMs: 5000 }), 9)).toBe(5000);
    expect(retryDelay(new MessagingError("request_failed", "timeout"), 1)).toBe(1000);
    expect(retryDelay(new Error("socket hang up"), 3)).toBe(4000);
    expect(retryDelay(new Error("socket hang up"), 20)).toBe(60_000);
  });
});

describe("Messaging connections", () => {
  it("shares one instance across consumers and preserves captured settings when a connection is reconfigured", async () => {
    const connection = { id: "connection", providerId: "provider", name: "Bot", enabled: true, settings: { name: "first" } };
    const { registry, life, set } = setup(connection);
    let creations = 0;
    const provider: MessagingProviderDefinition = {
      id: "provider", label: "Provider", settings: [textSetting("name")],
      async create({ settings }) { creations++; return instance(settings.name!); },
    };
    registry.declare("test.provider", [provider], life.group("call"));
    const options = { signal: new AbortController().signal };
    const old = await registry.resolve("connection", options);
    await registry.resolve("connection", options);
    expect(creations).toBe(1);
    set({ ...connection, settings: { name: "second" } });
    registry.restart(connection.id);
    const next = await registry.resolve(connection.id, options);
    expect((await old.listConversations({}, options)).conversations[0]?.title).toBe("first");
    expect((await next.listConversations({}, options)).conversations[0]?.title).toBe("second");
    expect(creations).toBe(2);
    registry.removeOwners(["test.provider"]);
    life.stop();
    expect(() => old.readMessages({ conversationId: "chat" }, options)).toThrow("closing");
  });

  it("keeps captured initialization through replacement while cancelling only the caller that stops waiting", async () => {
    const connection = { id: "connection", providerId: "provider", name: "Bot", enabled: true, settings: { identity: "old" } };
    const { registry, life, set } = setup(connection);
    let finishInitialization!: () => void, announceInitialization!: () => void;
    const initialized = new Promise<void>(resolve => { finishInitialization = resolve; });
    const entered = new Promise<void>(resolve => { announceInitialization = resolve; });
    cleanups.unshift(async () => { finishInitialization(); });
    registry.declare("test.provider", [{
      id: "provider", label: "Provider", settings: [textSetting("identity")],
      async create({ settings, signal }) {
        if (settings.identity === "old") { announceInitialization(); await initialized; signal.throwIfAborted(); }
        return instance(settings.identity!);
      },
    }], life.group("call"));
    const options = { signal: new AbortController().signal };
    const captured = await registry.resolve(connection.id, options);
    await entered;
    const cancelled = new AbortController();
    const waiting = captured.readMessages({ conversationId: "chat" }, { signal: cancelled.signal });
    cancelled.abort(new Error("Cancelled by caller"));
    await expect(waiting).rejects.toThrow("Cancelled by caller");
    set({ ...connection, settings: { identity: "new" } });
    registry.restart(connection.id);
    const replacement = await registry.resolve(connection.id, options);
    expect((await replacement.listConversations({}, options)).conversations[0]?.title).toBe("new");
    finishInitialization();
    expect((await captured.listConversations({}, options)).conversations[0]?.title).toBe("old");
  });

  // A dropped long poll must not leave the connection permanently failed, while a rejected credential must not be retried.
  it("reconnects the same instance after a transient receive failure and stops on a terminal one", async () => {
    const { registry, life } = setup({ id: "connection", providerId: "provider", name: "Bot", enabled: true, settings: {} }, (error, failures) =>
      retryDelay(error, failures) === null ? null : 0);
    let creations = 0, receives = 0;
    registry.declare("test.provider", [{
      id: "provider", label: "Provider", settings: [],
      async create() {
        creations++;
        return instance("bot", { async receive({ ready, signal }) {
          receives++;
          if (receives === 1) throw new Error("network down");
          if (receives === 2) { ready(); throw new MessagingError("unavailable", "token revoked"); }
          await new Promise(resolve => signal.addEventListener("abort", resolve));
        } });
      },
    }], life.group("call"));
    await status(registry, "connection", "failed");
    expect(receives).toBe(2);
    expect(creations).toBe(1);
    expect(registry.connections()[0]).toMatchObject({ identity: "bot", error: "token revoked" });
  });

  it("reflects transport session recovery without starting a second receiver", async () => {
    const { registry, life } = setup({ id: "connection", providerId: "provider", name: "Bot", enabled: true, settings: {} });
    let receiving!: Parameters<MessagingInstance["receive"]>[0], receives = 0;
    registry.declare("test.provider", [{
      id: "provider", label: "Provider", settings: [],
      async create() {
        return instance("bot", { async receive(options) {
          receiving = options;
          receives++;
          options.ready();
          await new Promise<void>(resolve => options.signal.addEventListener("abort", () => resolve(), { once: true }));
        } });
      },
    }], life.group("call"));
    await status(registry, "connection", "connected");
    receiving.reconnecting(new Error("Gateway connection lost."));
    expect(registry.connections()[0]).toMatchObject({ status: "reconnecting", error: "Gateway connection lost." });
    receiving.ready();
    expect(registry.connections()[0]).toMatchObject({ status: "connected" });
    expect(registry.connections()[0]?.error).toBeUndefined();
    expect(receives).toBe(1);
  });

  it("isolates a failing event listener from other consumers and from the provider's receiver", async () => {
    const { registry, life } = setup({ id: "connection", providerId: "provider", name: "Bot", enabled: true, settings: {} });
    const received: string[] = [];
    registry.subscribe(() => { throw new Error("consumer bug"); });
    registry.subscribe(event => { received.push(event.event.kind); });
    const errors = console.error;
    console.error = () => {};
    cleanups.push(async () => { console.error = errors; });
    registry.declare("test.provider", [{
      id: "provider", label: "Provider", settings: [],
      async create({ publish }) {
        return instance("bot", { async receive({ ready, signal }) {
          ready();
          publish({ kind: "conversation.discovered", conversation: { conversationId: "a", title: "A", kind: "private" } });
          publish({ kind: "conversation.discovered", conversation: { conversationId: "b", title: "B", kind: "private" } });
          await new Promise(resolve => signal.addEventListener("abort", resolve));
        } });
      },
    }], life.group("call"));
    await status(registry, "connection", "connected");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(received).toEqual(["conversation.discovered", "conversation.discovered"]);
    expect(registry.connections()[0]?.status).toBe("connected");
  });
});
