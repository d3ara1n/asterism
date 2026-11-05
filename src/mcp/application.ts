import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { implementCall, PluginApiError } from "@asterism-app/sdk/runtime";
import {
  ReadMcp, ReadMcpTools, SaveMcpServer, SetMcpServerEnabled, RemoveMcpServer,
  ConnectMcpServer, DisconnectMcpServer, AuthorizeMcpServer, ResetMcpAuth,
} from "@asterism-app/sdk/contracts";
import type { ConfigurationService } from "../configuration/service.ts";
import { McpHostService } from "./service.ts";
import { McpAuthorizationStore } from "./storage.ts";

/** Configuration, authorization and connections share the host lifetime independently of resource plugins. */
export class McpApplication {
  readonly service: McpHostService;
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly authorizations: McpAuthorizationStore;
  private readonly unsubscribe: () => void;
  constructor(db: DatabaseSync, private readonly configuration: ConfigurationService, changed: () => void) {
    this.authorizations = new McpAuthorizationStore(configuration);
    this.service = new McpHostService({ db, signal: this.lifetime.signal, authorizations: this.authorizations, log: console,
      resolveCredential: (value, signal) => configuration.resolveCredential(value, signal) }, () => {
      changed();
      for (const listener of this.listeners) listener();
    });
    this.unsubscribe = configuration.subscribeMcp(() => this.service.configure(this.servers()));
    this.service.configure(this.servers());
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  async close(): Promise<void> {
    this.unsubscribe();
    this.lifetime.abort();
    this.listeners.clear();
    await this.service.close();
  }
  private servers() { return this.configuration.mcpSettings().servers; }
  private configured(serverId: string) {
    if (!this.servers().some(item => item.id === serverId)) throw new PluginApiError("not_found", `The MCP server '${serverId}' is not configured.`);
  }
  readonly calls = [
    implementCall(ReadMcp, async () => this.service.states()),
    implementCall(ReadMcpTools, async ({ serverId }) => this.service.tools(serverId)),
    implementCall(SaveMcpServer, async ({ server, create }) => {
      const previous = this.servers().find(item => item.id === server.id);
      if (create && previous) throw new PluginApiError("conflict", `An MCP server with ID '${server.id}' already exists.`);
      if (!create && !previous) throw new PluginApiError("not_found", `The MCP server '${server.id}' is not configured.`);
      // A new server inherits no authorization left by an earlier server with the same ID.
      if (create) this.authorizations.delete(server.id);
      this.configuration.updateMcp(current => ({ servers: create ? [...current.servers, server]
        : current.servers.map(item => item.id === server.id ? server : item) }));
      if (previous && (!isDeepStrictEqual(previous.env, server.env) || !isDeepStrictEqual(previous.headers, server.headers)))
        await this.service.credentialsChanged(server.id);
      return null;
    }),
    implementCall(SetMcpServerEnabled, async ({ serverId, enabled }) => {
      this.configured(serverId);
      this.configuration.updateMcp(current => ({ servers: current.servers.map(item => item.id === serverId ? { ...item, enabled } : item) }));
      return null;
    }),
    implementCall(RemoveMcpServer, async ({ serverId }) => {
      this.configuration.updateMcp(current => ({ servers: current.servers.filter(item => item.id !== serverId) }));
      await this.service.settled();
      this.authorizations.delete(serverId);
      return null;
    }),
    // Settings connections run in the background; state events report the result while other actions remain available.
    implementCall(ConnectMcpServer, async ({ serverId }) => {
      const signal = this.lifetime.signal;
      void this.service.connect(serverId, signal).catch(error => {
        if (!signal.aborted) console.warn(`MCP connection to ${serverId} failed: ${String(error)}`);
      });
      return null;
    }),
    implementCall(DisconnectMcpServer, async ({ serverId }) => { await this.service.disconnect(serverId); return null; }),
    implementCall(AuthorizeMcpServer, ({ serverId }) => this.service.authorize(serverId)),
    implementCall(ResetMcpAuth, async ({ serverId }) => {
      await this.service.disconnect(serverId);
      this.authorizations.delete(serverId);
      this.service.invalidateDirectory(serverId);
      return null;
    }),
  ];
}
