import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@asterism-app/sdk/runtime";
import type { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";
import type { McpOAuth } from "./auth.ts";
import type { ConnectionPhase, McpServerConfig } from "./contract.ts";
import { ServerSession, type SessionHost } from "./session.ts";

const doubles = vi.hoisted(() => ({
  servers: [] as { listening: boolean; callback(params: URLSearchParams): number }[],
  connect: vi.fn(), exchange: vi.fn(), listenError: false,
}));

vi.mock("node:http", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    createServer: (handle: (request: { url: string }, response: unknown) => void) => {
      const events = new EventEmitter();
      const server = Object.assign(events, {
        listening: false,
        listen(_port: number, _host: string, ready: () => void) {
          if (doubles.listenError) events.emit("error", Object.assign(new Error("Port occupied"), { code: "EADDRINUSE" }));
          else { this.listening = true; ready(); }
        },
        close(done: () => void) { this.listening = false; done(); },
        closeAllConnections() {},
        callback(params: URLSearchParams) {
          let status = 0;
          const response = {
            writeHead(value: number) { status = value; return this; },
            end(_text: string, done?: () => void) { done?.(); },
          };
          handle({ url: `/callback?${params}` }, response);
          return status;
        },
      });
      doubles.servers.push(server);
      return server;
    },
  };
});

vi.mock("@modelcontextprotocol/client", () => ({
  UnauthorizedError: class extends Error {},
  Client: class {
    connect = doubles.connect;
    async close() {}
    async listTools() { return { tools: [{ name: "search", inputSchema: { type: "object" } }] }; }
    getInstructions() { return undefined; }
  },
  StreamableHTTPClientTransport: class {
    onclose?: () => void;
    constructor(readonly url: URL, readonly options: { authProvider: McpOAuth }) {}
    finishAuth(params: URLSearchParams) { return doubles.exchange(this.options.authProvider, params); }
    async close() { this.onclose?.(); }
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const config: McpServerConfig = {
  id: "remote", name: "Remote", enabled: true, mode: "eager", idleSeconds: 300,
  transport: "http", command: "", args: [], cwd: "", url: "https://mcp.example.test", auth: "oauth",
};
let session: ServerSession, provider: McpOAuth;
let phases: ConnectionPhase[], waits: Map<ConnectionPhase, ReturnType<typeof deferred<void>>>;
let saved: Map<string, string>;
const reached = (phase: ConnectionPhase) => {
  if (session.state().connection === phase) return Promise.resolve();
  const waiting = deferred<void>();
  waits.set(phase, waiting);
  return waiting.promise;
};

beforeEach(() => {
  doubles.servers.length = 0;
  doubles.listenError = false;
  doubles.connect.mockReset();
  doubles.exchange.mockReset();
  phases = []; waits = new Map();
  saved = new Map([["mcp.remote.oauth", JSON.stringify({ port: 62986 })]]);
  const host: SessionHost = {
    plugin: {
      lifetime: { signal: new AbortController().signal },
      secrets: { get: async (key: string) => saved.get(key) ?? null, set: async (key: string, value: string) => { saved.set(key, value); } },
      log: { warn() {}, error() {} },
    } as unknown as PluginContext,
    validator: {} as AjvJsonSchemaValidator, closed: false,
    credentials: async () => ({}), saveDirectory() {},
    notify() {
      const phase = session.state().connection;
      if (phases.at(-1) !== phase) phases.push(phase);
      waits.get(phase)?.resolve();
    },
  };
  session = new ServerSession(host, config, undefined);
  doubles.connect.mockImplementation(async (transport: { options: { authProvider: McpOAuth } }) => {
    provider = transport.options.authProvider;
    if (provider.tokens()) return;
    provider.saveCodeVerifier("test-verifier");
    await provider.redirectToAuthorization(new URL(`https://auth.example.test/authorize?state=${provider.state()}`));
    throw new Error("Authorization required");
  });
});

afterEach(async () => { await session.disconnect(); });

describe("MCP authorization lifecycle", () => {
  it("cancels an HTTP negotiation that waits for transport closure instead of the request signal", async () => {
    const probeStarted = deferred<void>();
    doubles.connect.mockImplementation((transport: { onclose?: () => void }) => new Promise<void>((_resolve, reject) => {
      transport.onclose = () => reject(new Error("Probe transport closed"));
      probeStarted.resolve();
    }));
    const result = session.connect(new AbortController().signal).catch(error => error);
    await probeStarted.promise;
    await session.disconnect();
    expect(await result).toMatchObject({ outcome: "cancelled" });
    expect(session.state().connection).toBe("disconnected");
  });

  it("keeps authorization independent of failed transports and returns to connecting after the callback", async () => {
    const exchangeStarted = deferred<void>(), finishExchange = deferred<void>();
    doubles.exchange.mockImplementation(async (oauth: McpOAuth, params: URLSearchParams) => {
      expect(oauth.codeVerifier()).toBe("test-verifier");
      expect(params.get("code")).toBe("authorization-code");
      exchangeStarted.resolve();
      await finishExchange.promise;
      await oauth.saveTokens({ access_token: "test-token", token_type: "Bearer" });
    });
    const connecting = session.connect(new AbortController().signal);
    await reached("awaiting_auth");
    expect(doubles.servers).toHaveLength(0);
    expect(session.state().authorizationExpiresAt).toBeNull();

    await session.authorize();
    const listening = doubles.servers[0]!;
    expect(listening.listening).toBe(true);
    expect(session.state().connection).toBe("authorizing");
    const deadline = session.state().authorizationExpiresAt;
    await session.authorize();
    expect(doubles.servers).toHaveLength(1);
    expect(session.state().authorizationExpiresAt).toBe(deadline);

    expect(listening.callback(new URLSearchParams({ state: "wrong-state", code: "invalid" }))).toBe(400);
    expect(listening.listening).toBe(true);
    expect(doubles.exchange).not.toHaveBeenCalled();
    expect(listening.callback(new URLSearchParams({ state: provider.state(), code: "authorization-code" }))).toBe(200);
    await exchangeStarted.promise;
    expect(session.state().connection).toBe("connecting");
    expect(session.state().authorizationExpiresAt).toBeNull();
    expect(listening.listening).toBe(false);
    finishExchange.resolve();
    await connecting;
    expect(phases).toEqual(["connecting", "awaiting_auth", "authorizing", "connecting", "connected"]);
    expect(session.state().toolCount).toBe(1);
  });

  it.each([false, true])("cancels the shared authorization wait with a listener started: %s", async start => {
    const connecting = session.connect(new AbortController().signal);
    const result = connecting.catch(error => error);
    await reached("awaiting_auth");
    if (start) await session.authorize();
    await session.disconnect();
    expect(await result).toMatchObject({ outcome: "cancelled" });
    expect(session.state()).toMatchObject({ connection: "disconnected", authorizationUrl: null, authorizationExpiresAt: null });
    expect(doubles.servers.every(server => !server.listening)).toBe(true);
    expect(doubles.exchange).not.toHaveBeenCalled();
    expect(saved.get("mcp.remote.oauth")).toBe(JSON.stringify({ port: 62986 }));
  });

  it("reports a callback bind failure and releases the connection wait", async () => {
    doubles.listenError = true;
    const connecting = session.connect(new AbortController().signal);
    const result = connecting.catch(error => error);
    await reached("awaiting_auth");
    await expect(session.authorize()).rejects.toThrow("port 62986 is in use");
    expect(await result).toMatchObject({ code: "connection_failed" });
    expect(session.state().connection).toBe("error");
    expect(doubles.servers.every(server => !server.listening)).toBe(true);
  });

  it("ends authorization after an exchange rejection without reconnecting", async () => {
    doubles.exchange.mockRejectedValue(new Error("Authorization denied"));
    const connecting = session.connect(new AbortController().signal);
    const result = connecting.catch(error => error);
    await reached("awaiting_auth");
    await session.authorize();
    doubles.servers[0]!.callback(new URLSearchParams({ state: provider.state(), error: "access_denied" }));
    expect(await result).toMatchObject({ code: "connection_failed", message: "Authorization denied" });
    expect(session.state()).toMatchObject({ connection: "error", authorizationUrl: null, authorizationExpiresAt: null });
    expect(doubles.connect).toHaveBeenCalledTimes(1);
    expect(doubles.servers[0]!.listening).toBe(false);
  });
});
