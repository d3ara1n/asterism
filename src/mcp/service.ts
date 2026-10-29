import { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";
import type { Progress, CallToolResult } from "@modelcontextprotocol/client";
import { PluginApiError } from "@asterism-app/sdk/runtime";
import type { McpEnvironment } from "./environment.ts";
import type { Json } from "@asterism-app/sdk/contracts";
import { credentialsSchema, type McpServerConfig, type McpServerState, McpError,
  mcpDirectorySchema as directorySchema, parseMcpToolIdentity, type McpCatalogServer, type McpDirectory as Directory } from "@asterism-app/sdk/contracts";
import { ServerSession, credentialKey, endpointOf, type SessionHost } from "./session.ts";

export { credentialKey, oauthKey } from "./session.ts";
export interface CallTarget { session: ServerSession; serverId: string; serverName: string; toolName: string }

/**
 * Application-wide shared server registry: one session per server, with multiple application sessions and MCP Host objects sharing the same connection and process.
 * Catalog caches are saved by server ID and endpoint; both connection modes read them at startup.
 */
export class McpHostService implements SessionHost {
  private sessions = new Map<string, ServerSession>();
  private retiring = new Set<Promise<void>>();
  private closing?: Promise<void>;
  closed = false;
  readonly validator = new AjvJsonSchemaValidator();
  private readonly db;
  constructor(readonly environment: McpEnvironment, private readonly changed: () => void) {
    this.db = environment.db;
  }
  notify() { if (!this.closed && !this.environment.signal.aborted) this.changed(); }
  async credentials(id: string): Promise<Record<string, string>> {
    const raw = await this.environment.secrets.get(credentialKey(id));
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
    const work = session.retire().catch(error => this.environment.log.error("MCP disconnect failed.", error));
    this.retiring.add(work);
    void work.finally(() => this.retiring.delete(work));
  }

  /** Configuration is the source of truth: deletion and endpoint changes retire old sessions, new sessions read the cache, and enabled eager sessions connect in the background. */
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
    void session.connect(this.environment.signal).catch(error => {
      if (!this.environment.signal.aborted) this.environment.log.warn(`MCP eager connection to ${session.id} failed: ${String(error)}`);
    });
  }
  /** After credentials change, the old catalog may no longer match visible tools; eager reconnects with the new credentials after disconnecting. */
  async credentialsChanged(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.invalidateDirectory();
    await session.disconnect();
    if (session.config.enabled && session.config.mode === "eager") this.startEager(session);
  }
  /** Waits for retired sessions to finish cleanup; credentials are removed after server deletion. */
  async settled() { await Promise.allSettled([...this.retiring]); }

  private get(id: string) {
    if (this.closed || this.environment.signal.aborted) throw new PluginApiError("unavailable", "The MCP service is closing.");
    const session = this.sessions.get(id);
    if (!session) throw new PluginApiError("not_found", `The MCP server '${id}' is not configured.`);
    return session;
  }
  /** Calls require a currently enabled server; catalog reads expose its observed state. */
  private enabled(id: string) {
    if (this.closed || this.environment.signal.aborted) throw new McpError("service_unavailable", "The MCP service is closing.");
    const session = this.sessions.get(id);
    if (!session) throw new McpError("server_not_found", `The MCP server '${id}' is not configured.`);
    if (!session.config.enabled) throw new McpError("server_disabled", `The MCP server '${id}' is disabled.`);
    return session;
  }
  states(): McpServerState[] { return [...this.sessions.values()].map(session => session.state()); }
  /** Catalog summary for display: reads the current cache without establishing a connection. */
  tools(id: string) {
    const directory = this.get(id).directory;
    return directory ? { tools: directory.tools.map(({ name, title, description }) => ({ name, ...(title && { title }), ...(description && { description }) })),
      ...(directory.instructions && { instructions: directory.instructions }) } : null;
  }
  catalog(): McpCatalogServer[] {
    return [...this.sessions.values()].map(session => ({ config: session.config, state: session.state(), directory: session.directory }));
  }
  /** Captures server and tool identities before a call starts; subsequent server renaming or removal does not affect its result or progress. */
  resolve(toolId: string): CallTarget {
    const [serverId, toolName] = parseMcpToolIdentity(toolId), session = this.enabled(serverId);
    return { session, serverId, serverName: session.config.name, toolName };
  }
  call(target: CallTarget, args: Record<string, Json>, signal: AbortSignal, progress: (value: Progress) => void): Promise<CallToolResult> {
    return target.session.call(target.toolName, args, signal, progress);
  }
  connect(id: string, signal: AbortSignal) { return this.get(id).connect(signal); }
  authorize(id: string) { return this.get(id).authorize(); }
  connectEnabled(id: string, signal: AbortSignal) { return this.enabled(id).connect(signal); }
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
