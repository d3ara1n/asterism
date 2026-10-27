import { Client, StreamableHTTPClientTransport, UnauthorizedError, type CallToolResult, type Progress, type Transport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";
import type { PluginContext } from "@asterism-app/sdk/runtime";
import type { Json } from "@asterism-app/sdk/contracts";
import type { ConnectionPhase, McpServerConfig, McpServerState } from "./contract.ts";
import { directorySchema, type CachedTool, type Directory } from "./catalog.ts";
import { McpError, McpInterrupted } from "./errors.ts";
import { McpOAuth } from "./auth.ts";
import { closeProcessTree } from "../shared/process-tree.ts";

export const credentialKey = (id: string) => `mcp.${id}.credentials`;
export const oauthKey = (id: string) => `mcp.${id}.oauth`;
/** Connection parameter identity; changes make the old connection and cached catalog inapplicable. The save entry point invalidates credential changes separately. */
export function endpointOf(config: McpServerConfig): string {
  return JSON.stringify(config.transport === "stdio" ? [config.transport, config.command, config.args, config.cwd] : [config.transport, config.url, config.auth]);
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
const STDERR_LIMIT = 4096;
const isUnauthorized = (error: unknown) => error instanceof UnauthorizedError || (error instanceof Error && error.name === "UnauthorizedError");

export interface SessionHost {
  readonly plugin: PluginContext;
  readonly validator: AjvJsonSchemaValidator;
  readonly closed: boolean;
  credentials(id: string): Promise<Record<string, string>>;
  saveDirectory(config: McpServerConfig, directory: Directory | undefined): void;
  notify(): void;
}
/** A client connection that is established or being established; aborting scope ends all its requests. */
interface Live { client: Client; transport: Transport; scope: AbortController; oauth?: McpOAuth; stderr: string; closing?: Promise<void> }
/** Lifecycle transition: at most one per server at a time; waiters share the result, and done never rejects. */
interface Transition { kind: "open" | "close"; done: Promise<void>; abort?: AbortController; failure?: unknown }

/**
 * Shared session for a single server. Connection establishment, disconnection, and configuration retirement pass serially through transition;
 * calls encountering connecting/awaiting_auth wait for the current transition without starting another connection.
 */
export class ServerSession {
  private phase: ConnectionPhase = "disconnected";
  private error: string | null = null;
  private authorizationUrl: string | null = null;
  private live?: Live;
  private transition?: Transition;
  private active = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private retired = false;
  constructor(private readonly host: SessionHost, public config: McpServerConfig, public directory: Directory | undefined) {}

  get id() { return this.config.id; }
  state(): McpServerState {
    const { id, name, enabled, mode } = this.config;
    return { id, name, enabled, mode, connection: this.phase, indexed: !!this.directory,
      toolCount: this.directory?.tools.length ?? 0, error: this.error, authorizationUrl: this.authorizationUrl };
  }
  tool(name: string): CachedTool | undefined { return this.directory?.tools.find(tool => tool.name === name); }

  /** Configuration changes for the same endpoint; false means the configuration is unchanged. Disabling disconnects immediately; the caller initiates connection for enabled eager sessions. */
  reconfigure(config: McpServerConfig): boolean {
    if (JSON.stringify(config) === JSON.stringify(this.config)) return false;
    this.config = config;
    if (!config.enabled) void this.disconnect().catch(error => this.host.plugin.log.error("MCP disconnect failed.", error));
    else this.armIdle();
    this.host.notify();
    return true;
  }
  /** Endpoint change or deletion; retired sessions establish no further connections. */
  retire(): Promise<void> { this.retired = true; return this.disconnect(); }
  invalidateDirectory() { this.directory = undefined; this.host.saveDirectory(this.config, undefined); this.host.notify(); }

  private usable() {
    if (this.retired || this.host.closed || this.host.plugin.lifetime.signal.aborted) throw new McpError("service_unavailable", "The MCP server configuration changed or the service is closing.");
    if (!this.config.enabled) throw new McpError("server_disabled", `The MCP server '${this.id}' is disabled.`);
  }
  /** Obtains a connection; connection failures become connection_failed, while cancellation retains the abort reason. */
  private async connection(signal: AbortSignal): Promise<Live> {
    try { return await this.acquire(signal); }
    catch (error) {
      if (error instanceof McpError || signal.aborted) throw error;
      throw new McpError("connection_failed", messageOf(error));
    }
  }
  /** Obtains an established connection: waits for an ongoing connection or authorization transition, and reconnects as needed after a disconnection transition ends. */
  private async acquire(signal: AbortSignal): Promise<Live> {
    for (;;) {
      signal.throwIfAborted();
      this.usable();
      if (this.live && this.phase === "connected" && !this.transition) return this.live;
      const transition = this.transition ?? this.startOpen();
      await wait(transition.done, signal);
      if (transition.kind === "close") continue;
      if (this.live && this.phase === "connected") return this.live;
      throw transition.failure ?? new Error("The MCP connection was closed.");
    }
  }
  private startOpen(): Transition {
    clearTimeout(this.timer);
    const abort = new AbortController();
    const transition: Transition = { kind: "open", abort, done: Promise.resolve() };
    this.transition = transition;
    transition.done = this.open(abort.signal).catch(error => { transition.failure = error; })
      .finally(() => { if (this.transition === transition) this.transition = undefined; this.armIdle(); });
    return transition;
  }
  private async open(signal: AbortSignal): Promise<void> {
    const config = this.config;
    const scope = AbortSignal.any([signal, this.host.plugin.lifetime.signal]);
    this.setPhase("connecting", null, null);
    let oauth: McpOAuth | undefined, attempt: Live | undefined, stderr = "";
    try {
      const values = await this.host.credentials(config.id);
      scope.throwIfAborted();
      if (config.transport === "http" && config.auth === "oauth") {
        oauth = new McpOAuth(this.host.plugin.secrets, oauthKey(config.id), scope);
        await oauth.load();
      }
      for (;;) {
        attempt = this.createLive(config, values, oauth, scope);
        try { await attempt.client.connect(attempt.transport, { signal: scope }); break; }
        catch (error) {
          // Enter the waiting state once browser authorization starts; the SDK may wrap authentication errors, so the authorization request itself is authoritative.
          const request = oauth?.takeAuthorization();
          if (!request) throw error;
          await this.closeLive(attempt); attempt = undefined;
          this.setPhase("awaiting_auth", null, request.url);
          const params = await request.callback;
          this.setPhase("connecting", null, null);
          // Authorization code exchange uses the same provider's PKCE verifier; reconnect with the new token after the exchange.
          await this.httpTransport(config, values, oauth!, scope).finishAuth(params);
        }
      }
      if (oauth) oauth.interactive = false;
      const listed = await attempt.client.listTools(undefined, { signal: scope, cacheMode: "refresh" });
      scope.throwIfAborted();
      this.storeDirectory(listed.tools, attempt.client.getInstructions());
      this.live = attempt; attempt = undefined;
      this.setPhase("connected", null, null);
    } catch (error) {
      stderr = attempt?.stderr ?? "";
      if (attempt) await this.closeLive(attempt);
      await oauth?.close();
      // Connections aborted by disconnection or service shutdown are treated as disconnected; the disconnection transition writes the state.
      if (!scope.aborted) {
        const message = describe(error, stderr);
        this.setPhase("error", message, null);
        this.host.plugin.log.warn(`MCP server ${config.id} connection failed: ${message}`);
        throw new Error(message);
      }
      throw error;
    }
  }
  private httpTransport(config: McpServerConfig, headers: Record<string, string>, oauth: McpOAuth | undefined, scope: AbortSignal) {
    return new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers }, ...(oauth && { authProvider: oauth }),
      // SDK OAuth discovery, refresh, and token exchange also use this fetch and are canceled with the connection scope.
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([
        scope, ...(init?.signal ? [init.signal] : []), ...(input instanceof Request ? [input.signal] : []),
      ]) }),
    });
  }
  private createLive(config: McpServerConfig, values: Record<string, string>, oauth: McpOAuth | undefined, transitionScope: AbortSignal): Live {
    const scope = new AbortController();
    const lifetime = AbortSignal.any([scope.signal, this.host.plugin.lifetime.signal]);
    const client = new Client({ name: "Asterism", version: "0.1.0" }, {
      // stdio uses the default initialize handshake and starts only the actual server process per connection; HTTP probes the protocol version on the original connection.
      capabilities: {}, ...(config.transport === "http" && { versionNegotiation: { mode: "auto" as const } }),
      listMaxPages: 0, jsonSchemaValidator: this.host.validator,
      listChanged: { tools: { onChanged: (error, tools) => {
        if (this.live !== live) return;
        if (error) { this.error = messageOf(error); this.host.notify(); }
        else if (tools) this.storeDirectory(tools, client.getInstructions());
      } } },
    });
    let transport: Transport;
    if (config.transport === "stdio") {
      // The task process has inherited the login shell environment; pass the full environment plus user-configured values, as the shell module does.
      const stdio = new StdioClientTransport({ command: config.command, args: config.args, cwd: config.cwd || undefined,
        env: { ...process.env as Record<string, string>, ...values }, stderr: "pipe" });
      stdio.stderr?.on("data", (chunk: Buffer) => { live.stderr = (live.stderr + chunk.toString("utf8")).slice(-STDERR_LIMIT); });
      transport = stdio;
    } else transport = this.httpTransport(config, values, oauth, AbortSignal.any([lifetime, transitionScope]));
    const live: Live = { client, transport, scope, oauth, stderr: "" };
    client.onclose = () => { if (!scope.signal.aborted) this.lost(live, describe(new Error("The MCP server closed the connection."), live.stderr)); };
    client.onerror = error => { if (!scope.signal.aborted && this.live === live) { this.error = messageOf(error); this.host.notify(); } };
    return live;
  }
  /** Unexpected end of an established connection: releases resources and records the reason; the next call reconnects. */
  private lost(live: Live, message: string) {
    if (this.live !== live) return;
    this.live = undefined;
    void this.closeLive(live).catch(error => this.host.plugin.log.error("MCP cleanup failed.", error));
    this.setPhase("error", message, null);
  }
  /** Aborts the scope and reaps the process tree; a snapshot supplies descendants of wrapper commands for cleanup. */
  private closeLive(live: Live): Promise<void> {
    return live.closing ??= (async () => {
      live.scope.abort();
      const pid = live.transport instanceof StdioClientTransport ? live.transport.pid : null;
      await closeProcessTree(pid, async () => { await Promise.allSettled([live.client.close(), live.transport.close()]); });
      await live.oauth?.close();
    })();
  }

  /** Disconnection aborts an ongoing connection or authorization wait, then closes the established connection. */
  async disconnect(): Promise<void> {
    clearTimeout(this.timer);
    for (;;) {
      const current = this.transition;
      if (!current) break;
      current.abort?.abort();
      await current.done;
      if (current.kind === "close") { if (current.failure) throw current.failure; return; }
    }
    const transition: Transition = { kind: "close", done: Promise.resolve() };
    this.transition = transition;
    const live = this.live; this.live = undefined;
    transition.done = (async () => { if (live) await this.closeLive(live); })()
      .catch(error => { transition.failure = error; })
      .finally(() => { if (this.transition === transition) this.transition = undefined; this.setPhase("disconnected", null, null); });
    await transition.done;
    if (transition.failure) throw transition.failure;
  }
  /** Establishes a connection when disconnected; refreshes the catalog when connected. */
  async connect(signal: AbortSignal): Promise<void> {
    this.active++; clearTimeout(this.timer);
    try {
      const connected = this.live && this.phase === "connected" && !this.transition;
      const live = await this.connection(signal);
      if (connected) {
        let listed;
        try { listed = await live.client.listTools(undefined, { signal: AbortSignal.any([signal, live.scope.signal]), cacheMode: "refresh" }); }
        catch (error) { if (signal.aborted) throw error; throw new McpError("request_failed", messageOf(error)); }
        if (this.live === live) this.storeDirectory(listed.tools, live.client.getInstructions());
      }
    } finally { this.active--; this.armIdle(); }
  }
  async call(name: string, args: Record<string, Json>, signal: AbortSignal, progress: (value: Progress) => void): Promise<CallToolResult> {
    let sent = false;
    this.active++; clearTimeout(this.timer);
    try {
      let live: Live;
      try { live = await this.connection(signal); }
      catch (error) { throw signal.aborted ? new McpInterrupted("cancelled", "The MCP call was cancelled before it was sent.") : error; }
      const tool = this.tool(name);
      if (!tool) throw new McpError("tool_not_found", "The MCP tool is not in the server's cached directory. mcp_connect refreshes it.");
      this.validate(tool, args);
      const scope = AbortSignal.any([signal, live.scope.signal]);
      scope.throwIfAborted();
      sent = true;
      try {
        // Calls have no deadline: call cancellation and the connection scope determine completion. The SDK timer uses its maximum interval.
        return await live.client.callTool({ name, arguments: args }, { signal: scope, timeout: 2_147_483_647, onprogress: progress });
      } catch (error) {
        // The token has expired and requires reauthorization: the authentication layer rejected the request, so the remote tool did not execute. Close the connection and reauthorize on the next call.
        if (isUnauthorized(error)) {
          const message = "MCP authorization expired. The next call starts a new authorization.";
          this.lost(live, message);
          throw new McpError("authorization_expired", message);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof McpError || error instanceof McpInterrupted) throw error;
      if (sent) throw new McpInterrupted("unknown", messageOf(error));
      throw signal.aborted ? new McpInterrupted("cancelled", "The MCP call was cancelled before it was sent.") : new McpError("request_failed", messageOf(error));
    } finally { this.active--; this.armIdle(); }
  }
  /** Local validation rejects arguments against the remote input schema; if the schema itself cannot compile, validation is left to the server. */
  private validate(tool: CachedTool, args: Record<string, Json>) {
    let check;
    try { check = this.host.validator.getValidator(tool.inputSchema); }
    catch (error) { this.host.plugin.log.warn(`MCP input schema for ${this.id}/${tool.name} could not be compiled: ${messageOf(error)}`); return; }
    const result = check(args);
    if (!result.valid) throw new McpError("invalid_tool_arguments", result.errorMessage ?? "MCP tool arguments are invalid.");
  }
  private armIdle() {
    clearTimeout(this.timer);
    if (this.retired || this.host.closed || this.config.mode !== "lazy" || this.active || this.transition || this.phase !== "connected") return;
    this.timer = setTimeout(() => { void this.disconnect().catch(error => this.host.plugin.log.error("MCP idle disconnect failed.", error)); }, this.config.idleSeconds * 1000);
    this.timer.unref();
  }
  private storeDirectory(tools: unknown, instructions?: string) {
    this.directory = directorySchema.parse({ tools, ...(instructions && { instructions }) });
    this.host.saveDirectory(this.config, this.directory);
    this.host.notify();
  }
  private setPhase(phase: ConnectionPhase, error: string | null, authorizationUrl: string | null) {
    this.phase = phase; this.error = error; this.authorizationUrl = authorizationUrl;
    this.host.notify();
  }
}

/** Canceling one waiter ends only its own wait; the shared transition continues. */
function wait<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function describe(error: unknown, stderr: string): string {
  const tail = stderr.trim();
  return tail ? `${messageOf(error)}\n--- stderr ---\n${tail}` : messageOf(error);
}
