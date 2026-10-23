import { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";
import type { Progress, CallToolResult } from "@modelcontextprotocol/client";
import { PluginApiError, type PluginContext } from "@atelier/sdk/runtime";
import type { Json } from "@atelier/sdk/contracts";
import { credentialsSchema, type McpServerConfig, type McpServerState } from "./contract.ts";
import { directorySchema, inspectTool, listCatalog, parseToolIdentity, searchCatalog, type CatalogServer, type Directory } from "./catalog.ts";
import { ServerSession, McpCallError, credentialKey, endpointOf, type SessionHost } from "./session.ts";

export { McpCallError, credentialKey, oauthKey } from "./session.ts";
export interface CallTarget { session: ServerSession; serverId: string; serverName: string; toolName: string }

/**
 * 全应用共享的服务器注册表：每台服务器一个会话，多个会话、多个 MCP Host 对象共用同一连接与进程。
 * 目录缓存按服务器 ID 与端点保存，两种连接模式在启动时同样读取。
 */
export class McpHostService implements SessionHost {
  private sessions = new Map<string, ServerSession>();
  private retiring = new Set<Promise<void>>();
  private closing?: Promise<void>;
  closed = false;
  readonly validator = new AjvJsonSchemaValidator();
  private readonly db;
  constructor(readonly plugin: PluginContext, private readonly changed: () => void) {
    this.db = plugin.db();
    this.db.exec("CREATE TABLE IF NOT EXISTS mcp_catalog (server_id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, directory TEXT NOT NULL)");
  }
  notify() { if (!this.closed && !this.plugin.signal.aborted) this.changed(); }
  async credentials(id: string): Promise<Record<string, string>> {
    const raw = await this.plugin.secrets.get(credentialKey(id));
    if (!raw) return {};
    const parsed = credentialsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error("Saved MCP environment or headers are invalid. Clear and re-enter them in MCP settings.");
    return parsed.data;
  }
  saveDirectory(config: McpServerConfig, directory: Directory | undefined) {
    if (!directory) { this.db.prepare("DELETE FROM mcp_catalog WHERE server_id = ?").run(config.id); return; }
    this.db.prepare("INSERT INTO mcp_catalog VALUES (?, ?, ?) ON CONFLICT(server_id) DO UPDATE SET endpoint=excluded.endpoint, directory=excluded.directory")
      .run(config.id, endpointOf(config), JSON.stringify(directory));
  }
  private loadDirectory(config: McpServerConfig): Directory | undefined {
    const row = this.db.prepare("SELECT directory FROM mcp_catalog WHERE server_id = ? AND endpoint = ?").get(config.id, endpointOf(config));
    if (!row) return undefined;
    try {
      const parsed = directorySchema.safeParse(JSON.parse(String(row.directory)));
      return parsed.success ? parsed.data : undefined;
    } catch { return undefined; }
  }
  private retire(session: ServerSession) {
    const work = session.retire().catch(error => this.plugin.log.error("MCP disconnect failed.", error));
    this.retiring.add(work);
    void work.finally(() => this.retiring.delete(work));
  }

  /** 配置是唯一真值：删除与端点变化退役旧会话，新会话读取缓存，启用的 eager 在后台连接。 */
  configure(configs: readonly McpServerConfig[]) {
    if (this.closed) return;
    for (const [id, session] of this.sessions) {
      const next = configs.find(config => config.id === id);
      if (next && endpointOf(next) === endpointOf(session.config)) continue;
      this.sessions.delete(id);
      this.retire(session);
      if (!next) this.saveDirectory(session.config, undefined);
    }
    for (const config of configs) {
      const existing = this.sessions.get(config.id);
      if (existing && !existing.reconfigure(config)) continue;
      const session = existing ?? new ServerSession(this, config, this.loadDirectory(config));
      this.sessions.set(config.id, session);
      if (config.enabled && config.mode === "eager") this.startEager(session);
    }
    this.notify();
  }
  private startEager(session: ServerSession) {
    const phase = session.state().connection;
    if (phase !== "disconnected" && phase !== "error") return;
    void session.connect(this.plugin.signal).catch(error => {
      if (!this.plugin.signal.aborted) this.plugin.log.warn(`MCP eager connection to ${session.id} failed: ${String(error)}`);
    });
  }
  /** 凭据变化后旧目录可能不再对应可见工具；断开后 eager 以新凭据重新连接。 */
  async credentialsChanged(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.invalidateDirectory();
    await session.disconnect();
    if (session.config.enabled && session.config.mode === "eager") this.startEager(session);
  }
  /** 等待已退役会话完成清理；删除服务器后再移除凭据。 */
  async settled() { await Promise.allSettled([...this.retiring]); }

  private get(id: string) {
    if (this.closed || this.plugin.signal.aborted) throw new PluginApiError("unavailable", "The MCP service is closing.");
    const session = this.sessions.get(id);
    if (!session) throw new PluginApiError("not_found", `The MCP server '${id}' is not configured.`);
    return session;
  }
  states(): McpServerState[] { return [...this.sessions.values()].map(session => session.state()); }
  /** 展示用目录摘要：读取当前缓存，不建立连接。 */
  tools(id: string) {
    const directory = this.get(id).directory;
    return directory ? { tools: directory.tools.map(({ name, title, description }) => ({ name, ...(title && { title }), ...(description && { description }) })),
      ...(directory.instructions && { instructions: directory.instructions }) } : null;
  }
  private catalog(): CatalogServer[] {
    return [...this.sessions.values()].map(session => ({ config: session.config, state: session.state(), directory: session.directory }));
  }
  list(args: { server_id?: string; offset: number; limit: number }) { return listCatalog(this.catalog(), args); }
  search(args: { query: string; server_id?: string; offset: number; limit: number }) { return searchCatalog(this.catalog(), args); }
  inspect(toolId: string) {
    const [serverId, name] = parseToolIdentity(toolId), session = this.get(serverId);
    if (!session.config.enabled) throw new PluginApiError("unavailable", "The MCP server is disabled.");
    const tool = session.tool(name);
    if (!tool) throw new PluginApiError("not_found", "The MCP tool is not indexed. mcp_connect refreshes the server's directory.");
    return inspectTool({ config: session.config, state: session.state(), directory: session.directory }, tool);
  }
  /** 调用开始前固定服务器与工具身份；之后服务器改名或移除不影响本次结果与进度。 */
  resolve(toolId: string): CallTarget {
    let serverId: string, toolName: string;
    try { [serverId, toolName] = parseToolIdentity(toolId); }
    catch (error) { throw new McpCallError("rejected", error instanceof Error ? error.message : String(error)); }
    const session = this.sessions.get(serverId);
    if (!session || this.closed) throw new McpCallError("rejected", `The MCP server '${serverId}' is not configured.`);
    if (!session.config.enabled) throw new McpCallError("rejected", "The MCP server is disabled.");
    return { session, serverId, serverName: session.config.name, toolName };
  }
  call(target: CallTarget, args: Record<string, Json>, signal: AbortSignal, progress: (value: Progress) => void): Promise<CallToolResult> {
    return target.session.call(target.toolName, args, signal, progress);
  }
  connect(id: string, signal: AbortSignal) { return this.get(id).connect(signal); }
  disconnect(id: string) { return this.get(id).disconnect(); }
  invalidateDirectory(id: string) { this.sessions.get(id)?.invalidateDirectory(); }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    return this.closing = (async () => {
      const results = await Promise.allSettled([...this.sessions.values()].map(session => session.disconnect()));
      await this.settled();
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), "MCP connections could not all be closed.");
    })();
  }
}
