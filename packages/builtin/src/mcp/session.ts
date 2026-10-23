import { Client, StreamableHTTPClientTransport, UnauthorizedError, type CallToolResult, type Progress, type Transport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";
import { PluginApiError, type PluginContext } from "@atelier/sdk/runtime";
import type { Json } from "@atelier/sdk/contracts";
import type { ConnectionPhase, McpServerConfig, McpServerState } from "./contract.ts";
import { directorySchema, type CachedTool, type Directory } from "./catalog.ts";
import { McpOAuth } from "./auth.ts";
import { closeProcessTree } from "../shared/process-tree.ts";

export class McpCallError extends Error {
  constructor(readonly outcome: "rejected" | "failed" | "cancelled" | "unknown", message: string) { super(message); }
}
export const credentialKey = (id: string) => `mcp.${id}.credentials`;
export const oauthKey = (id: string) => `mcp.${id}.oauth`;
/** 连接参数身份；变化时旧连接与缓存目录都不再适用。凭据变化由保存入口单独失效。 */
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
/** 一次已建立或正在建立的客户端连接；scope 中止即结束其全部请求。 */
interface Live { client: Client; transport: Transport; scope: AbortController; oauth?: McpOAuth; stderr: string; closing?: Promise<void> }
/** 生命周期过渡：同一服务器同时至多一个；等待者共享结果，done 不拒绝。 */
interface Transition { kind: "open" | "close"; done: Promise<void>; abort?: AbortController; failure?: unknown }

/**
 * 单台服务器的共享会话。连接建立、断开与配置退役串行经过 transition；
 * 调用遇到 connecting／awaiting_auth 时等待当前过渡，不另起连接。
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

  /** 同一端点的配置变化；返回 false 表示配置未变。停用即断开，启用的 eager 由调用方发起连接。 */
  reconfigure(config: McpServerConfig): boolean {
    if (JSON.stringify(config) === JSON.stringify(this.config)) return false;
    this.config = config;
    if (!config.enabled) void this.disconnect().catch(error => this.host.plugin.log.error("MCP disconnect failed.", error));
    else this.armIdle();
    this.host.notify();
    return true;
  }
  /** 端点变化或删除；退役后的会话不再建立连接。 */
  retire(): Promise<void> { this.retired = true; return this.disconnect(); }
  invalidateDirectory() { this.directory = undefined; this.host.saveDirectory(this.config, undefined); this.host.notify(); }

  private usable() {
    if (this.retired || this.host.closed || this.host.plugin.signal.aborted) throw new PluginApiError("unavailable", "The MCP server configuration changed or the service is closing.");
    if (!this.config.enabled) throw new PluginApiError("unavailable", "The MCP server is disabled.");
  }
  /** 取得已建立连接：正在连接或等待授权时等待该过渡，断开过渡结束后按需重新连接。 */
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
    const scope = AbortSignal.any([signal, this.host.plugin.signal]);
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
          // 已发起浏览器授权即进入等待；SDK 可能包装认证错误，以授权请求本身为准。
          const request = oauth?.takeAuthorization();
          if (!request) throw error;
          await this.closeLive(attempt); attempt = undefined;
          this.setPhase("awaiting_auth", null, request.url);
          const params = await request.callback;
          this.setPhase("connecting", null, null);
          // 授权码交换使用同一 provider 的 PKCE verifier；交换后以新令牌重新连接。
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
      // 断开与服务关闭中止的连接按断开处理，状态由断开过渡写入。
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
      // SDK 的 OAuth 发现、刷新与令牌交换也消费这个 fetch，随连接作用域取消。
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([
        scope, ...(init?.signal ? [init.signal] : []), ...(input instanceof Request ? [input.signal] : []),
      ]) }),
    });
  }
  private createLive(config: McpServerConfig, values: Record<string, string>, oauth: McpOAuth | undefined, transitionScope: AbortSignal): Live {
    const scope = new AbortController();
    const lifetime = AbortSignal.any([scope.signal, this.host.plugin.signal]);
    const client = new Client({ name: "Atelier", version: "0.1.0" }, {
      // stdio 使用默认 initialize 握手，每次连接只启动实际服务器进程；HTTP 在原连接上探测协议版本。
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
      // 任务进程已继承登录 shell 环境；与 shell 模块一致传递完整环境加用户配置值。
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
  /** 已建立连接意外结束：释放资源并记录原因，下次调用重新连接。 */
  private lost(live: Live, message: string) {
    if (this.live !== live) return;
    this.live = undefined;
    void this.closeLive(live).catch(error => this.host.plugin.log.error("MCP cleanup failed.", error));
    this.setPhase("error", message, null);
  }
  /** 中止作用域并回收进程树；包装命令的后代由快照补齐清理。 */
  private closeLive(live: Live): Promise<void> {
    return live.closing ??= (async () => {
      live.scope.abort();
      const pid = live.transport instanceof StdioClientTransport ? live.transport.pid : null;
      await closeProcessTree(pid, async () => { await Promise.allSettled([live.client.close(), live.transport.close()]); });
      await live.oauth?.close();
    })();
  }

  /** 断开中止正在进行的连接或授权等待，再关闭已建立连接。 */
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
  /** 未连接时建立连接；已连接时刷新目录。 */
  async connect(signal: AbortSignal): Promise<void> {
    this.active++; clearTimeout(this.timer);
    try {
      const connected = this.live && this.phase === "connected" && !this.transition;
      const live = await this.acquire(signal);
      if (connected) {
        const listed = await live.client.listTools(undefined, { signal: AbortSignal.any([signal, live.scope.signal]), cacheMode: "refresh" });
        if (this.live === live) this.storeDirectory(listed.tools, live.client.getInstructions());
      }
    } finally { this.active--; this.armIdle(); }
  }
  async call(name: string, args: Record<string, Json>, signal: AbortSignal, progress: (value: Progress) => void): Promise<CallToolResult> {
    let sent = false;
    this.active++; clearTimeout(this.timer);
    try {
      let live: Live;
      try { live = await this.acquire(signal); }
      catch (error) { throw signal.aborted ? new McpCallError("cancelled", "The MCP call was cancelled before it was sent.") : new McpCallError("failed", messageOf(error)); }
      const tool = this.tool(name);
      if (!tool) throw new McpCallError("rejected", "The MCP tool is not in the server's current directory. mcp_connect refreshes it.");
      this.validate(tool, args);
      const scope = AbortSignal.any([signal, live.scope.signal]);
      scope.throwIfAborted();
      sent = true;
      try {
        // 调用不设期限：结束由调用取消与连接作用域决定。SDK 定时器取其最大跨度。
        return await live.client.callTool({ name, arguments: args }, { signal: scope, timeout: 2_147_483_647, onprogress: progress });
      } catch (error) {
        // 令牌失效且需要重新授权：请求被认证层拒绝，远端工具未执行。关闭连接，下次调用重新授权。
        if (isUnauthorized(error)) { this.lost(live, "MCP authorization expired. The next call starts a new authorization."); sent = false; }
        throw error;
      }
    } catch (error) {
      if (error instanceof McpCallError) throw error;
      throw new McpCallError(sent ? "unknown" : signal.aborted ? "cancelled" : "failed", messageOf(error));
    } finally { this.active--; this.armIdle(); }
  }
  /** 本地校验按远端输入 schema 拒绝参数；schema 本身无法编译时交由服务器校验。 */
  private validate(tool: CachedTool, args: Record<string, Json>) {
    let check;
    try { check = this.host.validator.getValidator(tool.inputSchema); }
    catch (error) { this.host.plugin.log.warn(`MCP input schema for ${this.id}/${tool.name} could not be compiled: ${messageOf(error)}`); return; }
    const result = check(args);
    if (!result.valid) throw new McpCallError("rejected", result.errorMessage ?? "MCP tool arguments are invalid.");
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

/** 单个等待者取消只结束自己的等待，共享过渡继续。 */
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
