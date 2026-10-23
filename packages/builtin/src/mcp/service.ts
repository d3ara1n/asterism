import { Client, StreamableHTTPClientTransport, type CallToolResult, type Progress, type Transport } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";
import type { PluginContext } from "@atelier/sdk/runtime";
import { PluginApiError } from "@atelier/sdk/runtime";
import type { Json } from "@atelier/sdk/contracts";
import { credentialsSchema, type McpServerConfig, type McpServerState } from "./contract.ts";
import { directorySchema, parseToolIdentity, listCatalog, searchCatalog, type Directory, type CatalogServer, type CachedTool } from "./catalog.ts";
import { McpOAuth } from "./auth.ts";
import { closeProcessTree } from "../shared/process-tree.ts";

interface Connection { client: Client; transport: Transport; controller: AbortController; oauth?: McpOAuth; closing?: Promise<void> }
interface Entry { config: McpServerConfig; state: McpServerState; directory?: Directory; connection?: Connection; opening?: AbortController; pending?: Promise<void>; timer?: ReturnType<typeof setTimeout>; active: number }
export class McpCallError extends Error {
  constructor(readonly outcome: "rejected" | "failed" | "cancelled" | "unknown", message: string) { super(message); }
}
export const credentialKey = (id: string) => `mcp.${id}.credentials`;
export const oauthKey = (id: string) => `mcp.${id}.oauth`;
function endpoint(config: McpServerConfig) { return JSON.stringify(config.transport === "stdio" ? [config.transport, config.command, config.args, config.cwd] : [config.transport, config.url, config.auth]); }
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

/** 共享连接的建立由模块拥有；单个等待者取消只结束自己的等待。 */
function wait<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    work.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  });
}

/** 模块拥有服务器、目录缓存和连接；资源对象只是共享服务的授权入口。 */
export class McpHostService {
  private entries = new Map<string, Entry>();
  private operations = new Set<Promise<unknown>>();
  private closed = false;
  private closing?: Promise<void>;
  private readonly validator = new AjvJsonSchemaValidator();
  private readonly db;
  constructor(private readonly plugin: PluginContext, private readonly changed: () => void) {
    this.db = plugin.db();
    this.db.exec("CREATE TABLE IF NOT EXISTS mcp_catalog (server_id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, directory TEXT NOT NULL)");
  }
  private track<T>(work: Promise<T>): Promise<T> {
    this.operations.add(work);
    void work.then(() => this.operations.delete(work), () => this.operations.delete(work));
    return work;
  }
  private notify() { if (!this.closed && !this.plugin.signal.aborted) this.changed(); }
  private get(id: string) {
    if (this.closed || this.plugin.signal.aborted) throw new PluginApiError("unavailable", "The MCP service is closing.");
    const entry = this.entries.get(id);
    if (!entry) throw new PluginApiError("not_found", "The MCP server is unavailable.");
    return entry;
  }
  configure(configs: readonly McpServerConfig[]) {
    if (this.closed) return;
    for (const [id, entry] of this.entries) {
      const next = configs.find(config => config.id === id);
      if (!next || endpoint(next) !== endpoint(entry.config)) {
        this.entries.delete(id);
        void this.track(this.disconnectEntry(entry)).catch(error => this.plugin.log.error("MCP disconnect failed.", error));
      }
      if (!next) this.db.prepare("DELETE FROM mcp_catalog WHERE server_id = ?").run(id);
    }
    for (const config of configs) {
      let entry = this.entries.get(config.id);
      if (!entry) {
        const stored = config.mode === "lazy"
          ? this.db.prepare("SELECT directory FROM mcp_catalog WHERE server_id = ? AND endpoint = ?").get(config.id, endpoint(config))
          : undefined;
        const directory = stored ? directorySchema.parse(JSON.parse(String(stored.directory))) : undefined;
        entry = { config, directory, active: 0,
          state: { id: config.id, name: config.name, description: config.description, enabled: config.enabled, mode: config.mode,
            connection: "disconnected", indexed: false, toolCount: 0, error: null, authorizationUrl: null } };
        this.entries.set(config.id, entry);
      } else entry.config = config;
      Object.assign(entry.state, { name: config.name, description: config.description, enabled: config.enabled, mode: config.mode });
      if (!config.enabled) void this.track(this.disconnectEntry(entry)).catch(error => this.plugin.log.error("MCP disconnect failed.", error));
      else if (config.mode === "eager" && !entry.connection && !entry.pending) {
        void this.connect(config.id, this.plugin.signal).catch(error => { if (!this.plugin.signal.aborted) this.plugin.log.warn(`MCP startup connection failed: ${messageOf(error)}`); });
      } else this.armIdle(entry);
    }
    this.notify();
  }
  states(): McpServerState[] {
    return [...this.entries.values()].map(entry => ({ ...entry.state, indexed: !!entry.directory, toolCount: entry.directory?.tools.length ?? 0 }));
  }
  private catalog(): CatalogServer[] {
    const states = this.states();
    return [...this.entries.values()].map((entry, index) => ({ config: entry.config, state: states[index]!, directory: entry.directory }));
  }
  list(args: { server_id?: string; offset: number; limit: number }) { return listCatalog(this.catalog(), args); }
  search(args: { query: string; server_id?: string; offset: number; limit: number }) { return searchCatalog(this.catalog(), args); }
  inspect(id: string) {
    const [serverId, name] = parseToolIdentity(id), entry = this.get(serverId);
    if (!entry.config.enabled) throw new PluginApiError("unavailable", "The MCP server is disabled.");
    const tool = entry.directory?.tools.find(item => item.name === name);
    if (!tool) throw new PluginApiError("not_found", "The MCP tool is not indexed. mcp_connect refreshes the server's directory.");
    return { tool_id: id, server_id: serverId, server: entry.config.name, ...tool,
      ...(entry.directory?.instructions ? { server_instructions: entry.directory.instructions } : {}) };
  }
  private saveDirectory(entry: Entry, tools: unknown, instructions?: string) {
    const directory = directorySchema.parse({ tools, ...(instructions && { instructions }) });
    entry.directory = directory;
    this.db.prepare("INSERT INTO mcp_catalog VALUES (?, ?, ?) ON CONFLICT(server_id) DO UPDATE SET endpoint=excluded.endpoint, directory=excluded.directory")
      .run(entry.config.id, endpoint(entry.config), JSON.stringify(directory));
    this.notify();
  }
  private async refresh(entry: Entry, connection: Connection) {
    const result = await connection.client.listTools(undefined, { signal: connection.controller.signal, cacheMode: "refresh" });
    connection.controller.signal.throwIfAborted();
    this.saveDirectory(entry, result.tools, connection.client.getInstructions());
  }
  async connect(id: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const entry = this.get(id);
    if (!entry.config.enabled) throw new PluginApiError("unavailable", "The MCP server is disabled.");
    clearTimeout(entry.timer);
    if (entry.pending) return wait(entry.pending, signal);
    entry.active++;
    entry.pending = this.track((async () => {
      try {
        if (entry.connection && entry.state.connection === "connected") await this.refresh(entry, entry.connection);
        else { await this.disconnectEntry(entry); await this.open(entry); }
      } finally { entry.pending = undefined; entry.active--; this.armIdle(entry); }
    })());
    return wait(entry.pending, signal);
  }
  private async open(entry: Entry) {
    this.plugin.signal.throwIfAborted();
    entry.state.connection = "connecting"; entry.state.error = null; entry.state.authorizationUrl = null; this.notify();
    const config = entry.config, controller = new AbortController();
    entry.opening = controller;
    const lifetime = AbortSignal.any([this.plugin.signal, controller.signal]);
    const client = new Client({ name: "Atelier", version: "0.1.0" }, {
      // stdio 使用 SDK 默认握手，每次连接只启动实际服务器进程；HTTP 可以在原连接探测。
      capabilities: {}, ...(config.transport === "http" && { versionNegotiation: { mode: "auto" as const } }),
      listMaxPages: 0, jsonSchemaValidator: this.validator,
      listChanged: { tools: { onChanged: (error, tools) => {
        if (controller.signal.aborted) return;
        if (error) { entry.state.error = messageOf(error); this.notify(); }
        else if (tools) this.saveDirectory(entry, tools, client.getInstructions());
      } } },
    });
    let oauth: McpOAuth | undefined;
    let transport: Transport | undefined;
    try {
      const raw = await this.plugin.secrets.get(credentialKey(config.id));
      const values = raw ? credentialsSchema.parse(JSON.parse(raw)) : {};
      lifetime.throwIfAborted();
      if (config.transport === "stdio") {
        const stdio = new StdioClientTransport({ command: config.command, args: config.args, cwd: config.cwd || undefined,
          env: { ...getDefaultEnvironment(), ...values }, stderr: "pipe" });
        stdio.stderr?.on("data", (chunk: Buffer) => this.plugin.log.info(`MCP ${config.id} stderr: ${chunk.toString("utf8")}`));
        const close = stdio.close.bind(stdio);
        let closing: Promise<void> | undefined;
        stdio.close = () => closing ??= closeProcessTree(stdio.pid, close);
        transport = stdio;
      } else {
        if (config.auth === "oauth") {
          oauth = new McpOAuth(this.plugin.secrets, oauthKey(config.id), url => {
            entry.state.authorizationUrl = url; entry.state.connection = "awaiting_auth"; this.notify();
          }, error => { entry.state.error = messageOf(error); entry.state.connection = "error"; this.notify(); });
          await oauth.start(lifetime);
        }
        transport = new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: values }, ...(oauth && { authProvider: oauth }),
          // SDK 的 OAuth 发现、刷新与 token 交换也消费这个 fetch。
          fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([
            lifetime, ...(init?.signal ? [init.signal] : []), ...(input instanceof Request ? [input.signal] : []),
          ]) }),
        });
      }
      const connection: Connection = { client, transport, controller, oauth };
      entry.connection = connection;
      client.onclose = () => { if (!controller.signal.aborted) { entry.state.connection = "disconnected"; this.notify(); } };
      client.onerror = error => { if (!controller.signal.aborted) { entry.state.error = messageOf(error); this.notify(); } };
      if (oauth && transport instanceof StreamableHTTPClientTransport) {
        const http = transport;
        oauth.onCallback(async params => {
          await this.track((async () => {
            controller.signal.throwIfAborted();
            await http.finishAuth(params);
            entry.state.authorizationUrl = null;
          })());
        }, () => {
          // 浏览器回调已交付并关闭监听，重连复用原回调地址与持久凭据。
          this.plugin.tasks.start(`mcp.oauth.${config.id}`, async taskSignal => {
            controller.signal.throwIfAborted();
            await this.closeConnection(connection, false);
            entry.connection = undefined;
            await this.connect(config.id, taskSignal);
          });
        });
      }
      await client.connect(transport, { signal: lifetime });
      this.plugin.signal.throwIfAborted();
      await this.refresh(entry, connection);
      entry.state.connection = "connected"; entry.state.error = null; this.notify();
      // 已连接客户端仍保留 OAuth provider，供令牌刷新和后续认证使用。
    } catch (error) {
      if (entry.state.authorizationUrl && !this.plugin.signal.aborted && !controller.signal.aborted) {
        entry.state.connection = "awaiting_auth"; this.notify();
        throw new PluginApiError("unavailable", "MCP authorization is awaiting completion in settings.");
      }
      controller.abort();
      await Promise.allSettled([client.close(), transport?.close(), oauth?.close()]);
      entry.connection = undefined;
      entry.state.connection = "error"; entry.state.error = messageOf(error); this.notify();
      throw error;
    }
  }
  private closeConnection(connection: Connection, closeOAuth = true): Promise<void> {
    return connection.closing ??= (async () => {
      connection.controller.abort();
      const results = await Promise.allSettled([connection.client.close(), ...(closeOAuth ? [connection.oauth?.close()] : [])]);
      // connect 失败前 transport 也可能已启动，由 transport 自身执行幂等清理。
      await connection.transport.close();
      for (const result of results) if (result.status === "rejected") throw result.reason;
    })();
  }
  private async disconnectEntry(entry: Entry) {
    clearTimeout(entry.timer);
    entry.opening?.abort(); entry.opening = undefined;
    const connection = entry.connection; entry.connection = undefined;
    if (connection) await this.closeConnection(connection);
    entry.state.connection = "disconnected"; entry.state.authorizationUrl = null; this.notify();
  }
  async disconnect(id: string) {
    const entry = this.get(id);
    await this.track(this.disconnectEntry(entry));
    await entry.pending?.catch(() => {});
  }
  private armIdle(entry: Entry) {
    clearTimeout(entry.timer);
    if (this.closed || entry.config.mode !== "lazy" || entry.active || entry.pending || entry.state.connection !== "connected") return;
    entry.timer = setTimeout(() => { void this.track(this.disconnectEntry(entry)).catch(error => this.plugin.log.error("MCP idle disconnect failed.", error)); }, entry.config.idleSeconds * 1000);
    entry.timer.unref();
  }
  private validate(tool: CachedTool, args: Record<string, Json>) {
    try {
      const result = this.validator.getValidator(tool.inputSchema)(args);
      if (!result.valid) throw new McpCallError("rejected", result.errorMessage ?? "MCP tool arguments are invalid.");
    } catch (error) { if (error instanceof McpCallError) throw error; throw new McpCallError("rejected", `MCP input schema could not be validated: ${messageOf(error)}`); }
  }
  async call(id: string, args: Record<string, Json>, signal: AbortSignal, progress: (value: Progress) => void): Promise<{ result: CallToolResult; serverId: string; serverName: string; toolName: string }> {
    const [serverId, name] = parseToolIdentity(id), entry = this.get(serverId);
    let sent = false;
    entry.active++; clearTimeout(entry.timer);
    try {
      signal.throwIfAborted();
      if (!entry.config.enabled) throw new McpCallError("rejected", "The MCP server is disabled.");
      if (entry.state.connection !== "connected") await this.connect(serverId, signal);
      const connection = entry.connection!;
      const tool = entry.directory?.tools.find(item => item.name === name);
      if (!tool) throw new McpCallError("rejected", "The MCP tool is unavailable in the server's current directory.");
      this.validate(tool, args);
      const lifetime = AbortSignal.any([signal, connection.controller.signal]); lifetime.throwIfAborted();
      sent = true;
      // SDK 使用 Node 定时器；采用其最大计时跨度，实际终止由调用与连接作用域控制。
      const result = await this.track(connection.client.callTool({ name, arguments: args }, { signal: lifetime, timeout: 2_147_483_647, onprogress: progress }));
      return { result, serverId, serverName: entry.config.name, toolName: name };
    } catch (error) {
      if (error instanceof McpCallError) throw error;
      throw new McpCallError(sent ? "unknown" : signal.aborted ? "cancelled" : "failed", messageOf(error));
    } finally { entry.active--; this.armIdle(entry); }
  }
  async resetCredentials(id: string) {
    await this.disconnect(id);
    await this.plugin.secrets.delete(oauthKey(id));
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    return this.closing = (async () => {
      const results = await Promise.allSettled([...this.entries.values()].map(entry => this.disconnectEntry(entry)));
      await Promise.allSettled([...this.operations]);
      // 取消期间完成的连接同样经过最终清理。
      results.push(...await Promise.allSettled([...this.entries.values()].map(entry => this.disconnectEntry(entry))));
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), "MCP connections could not all be closed.");
    })();
  }
}
