import type { DatabaseSync } from "node:sqlite";
import { implementCall, PluginApiError } from "@asterism-app/sdk/runtime";
import {
  ReadMcp, ReadMcpTools, ReadMcpCredentials, SaveMcpServer, SetMcpServerEnabled, RemoveMcpServer,
  ConnectMcpServer, DisconnectMcpServer, AuthorizeMcpServer, ResetMcpAuth,
} from "@asterism-app/sdk/contracts";
import type { ConfigurationService } from "../configuration/service.ts";
import { McpHostService, credentialKey, oauthKey } from "./service.ts";
import { McpCredentialStore } from "./storage.ts";

/** Configuration, credentials and connections share the host lifetime independently of resource plugins. */
export class McpApplication {
  readonly service: McpHostService;
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly secrets: McpCredentialStore;
  private readonly unsubscribe: () => void;
  constructor(db: DatabaseSync, private readonly configuration: ConfigurationService, changed: () => void) {
    this.secrets = new McpCredentialStore(configuration);
    this.service = new McpHostService({ db, signal: this.lifetime.signal, secrets: this.secrets, log: console }, () => {
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
    implementCall(ReadMcpCredentials, ({ serverId }) => { this.configured(serverId); return this.service.credentials(serverId); }),
    implementCall(SaveMcpServer, async ({ server, create, credentials }) => {
      const exists = this.servers().some(item => item.id === server.id);
      if (create && exists) throw new PluginApiError("conflict", `An MCP server with ID '${server.id}' already exists.`);
      if (!create && !exists) throw new PluginApiError("not_found", `The MCP server '${server.id}' is not configured.`);
      // A new server inherits no credentials or authorization left by an earlier server with the same ID.
      if (create) {
        await this.secrets.delete(oauthKey(server.id));
        if (credentials.action === "replace") await this.secrets.set(credentialKey(server.id), JSON.stringify(credentials.values));
        else await this.secrets.delete(credentialKey(server.id));
      } else if (credentials.action === "replace") {
        await this.secrets.set(credentialKey(server.id), JSON.stringify(credentials.values));
        await this.service.credentialsChanged(server.id);
      }
      this.configuration.updateMcp(current => ({ servers: create ? [...current.servers, server]
        : current.servers.map(item => item.id === server.id ? server : item) }));
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
      await this.secrets.delete(credentialKey(serverId));
      await this.secrets.delete(oauthKey(serverId));
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
      await this.secrets.delete(oauthKey(serverId));
      this.service.invalidateDirectory(serverId);
      return null;
    }),
  ];
}
