import { mcpCard } from "../shared/card-appearance.ts";
import { defineModule, implementResource, implementCreation, implementTool, implementCall, PluginApiError, type CallResult } from "@asterism/sdk/runtime";
import { type Json, type ResourceRef } from "@asterism/sdk/contracts";
import { McpHost, CreateMcpHost, McpHostView, McpList, McpSearch, McpInspect, McpConnect, McpCall, McpChanged,
  ReadMcp, SaveMcpServer, ReadMcpCredentials, ReadMcpTools, SetMcpServerEnabled, RemoveMcpServer, ConnectMcpServer, DisconnectMcpServer, ResetMcpAuth, type McpCallData } from "./contract.ts";
import { McpHostService, credentialKey, oauthKey, type CallTarget } from "./service.ts";
import { McpError, McpInterrupted, mcpErrorCodes } from "./errors.ts";
import { convertMcpResult, mcpResultToModel } from "./result.ts";
import { BuiltinSettings } from "../settings/contract.ts";
import { describeServer } from "./catalog.ts";

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
type McpFailure = Extract<CallResult<never>, { kind: "rejected" | "failed" | "cancelled" | "unknown" }>;
function mcpOutcome(error: unknown, signal: AbortSignal): McpFailure {
  if (error instanceof McpInterrupted) return { kind: error.outcome, message: error.message };
  if (error instanceof McpError) return { kind: mcpErrorCodes[error.code], error: { code: error.code, message: error.message } };
  if (signal.aborted) return { kind: "cancelled", message: "The MCP operation was cancelled." };
  return { kind: "failed", error: { code: "request_failed", message: messageOf(error) } };
}
async function readResult(work: () => Json | Promise<Json>, signal: AbortSignal): Promise<CallResult> {
  try { signal.throwIfAborted(); return { kind: "succeeded", data: await work() }; }
  catch (error) { return mcpOutcome(error, signal); }
}

export default defineModule(plugin => {
  const config = plugin.config(BuiltinSettings), objects = new Map<string, ResourceRef>();
  const service = new McpHostService(plugin, () => {
    plugin.ipc.events.publish(McpChanged, {});
    for (const ref of objects.values()) plugin.object(ref.sessionId, McpHost, ref.id).invalidate();
  });
  const unsubscribe = config.subscribe(value => service.configure(value.mcp.servers));
  // The connection pool belongs to the plugin lifecycle: archiving a session or removing an object only unregisters it, without disconnecting connections still used by other sessions.
  plugin.lifetime.defer(async () => { unsubscribe(); await service.close(); });
  // Tasks start after synchronous assembly completes, once state events and resource contracts are registered.
  plugin.tasks.start("mcp.start", async signal => { await Promise.resolve(); signal.throwIfAborted(); service.configure(config.get().mcp.servers); });
  const servers = () => config.get().mcp.servers;
  return {
    events: [McpChanged],
    calls: [
      implementCall(ReadMcp, async () => service.states()),
      implementCall(ReadMcpTools, async ({ serverId }) => service.tools(serverId)),
      implementCall(ReadMcpCredentials, async ({ serverId }) => {
        if (!servers().some(item => item.id === serverId)) throw new PluginApiError("not_found", `The MCP server '${serverId}' is not configured.`);
        return service.credentials(serverId);
      }),
      implementCall(SaveMcpServer, async ({ server, create, credentials }) => {
        const exists = servers().some(item => item.id === server.id);
        if (create && exists) throw new PluginApiError("conflict", `An MCP server with ID '${server.id}' already exists.`);
        if (!create && !exists) throw new PluginApiError("not_found", `The MCP server '${server.id}' is not configured.`);
        // A new server does not inherit authorization left by an old server with the same ID; editing invalidates the catalog and reconnects with new values only when values change.
        if (create) await Promise.all([plugin.secrets.set(credentialKey(server.id), JSON.stringify(credentials)), plugin.secrets.delete(oauthKey(server.id))]);
        else if (JSON.stringify(await service.credentials(server.id)) !== JSON.stringify(credentials)) {
          await plugin.secrets.set(credentialKey(server.id), JSON.stringify(credentials));
          await service.credentialsChanged(server.id);
        }
        config.update(current => ({ ...current, mcp: { servers: create ? [...current.mcp.servers, server]
          : current.mcp.servers.map(item => item.id === server.id ? server : item) } }));
        return null;
      }),
      implementCall(SetMcpServerEnabled, async ({ serverId, enabled }) => {
        if (!servers().some(item => item.id === serverId)) throw new PluginApiError("not_found", `The MCP server '${serverId}' is not configured.`);
        config.update(current => ({ ...current, mcp: { servers: current.mcp.servers.map(item => item.id === serverId ? { ...item, enabled } : item) } }));
        return null;
      }),
      implementCall(RemoveMcpServer, async ({ serverId }) => {
        config.update(current => ({ ...current, mcp: { servers: current.mcp.servers.filter(item => item.id !== serverId) } }));
        await service.settled();
        await Promise.all([plugin.secrets.delete(credentialKey(serverId)), plugin.secrets.delete(oauthKey(serverId))]);
        return null;
      }),
      // Connections from the settings page run in the background: other page actions remain available while browser authorization is pending, and state events convey the result.
      implementCall(ConnectMcpServer, async ({ serverId }) => {
        const signal = plugin.lifetime.signal;
        void service.connect(serverId, signal).catch(error => { if (!signal.aborted) plugin.log.warn(`MCP connection to ${serverId} failed: ${messageOf(error)}`); });
        return null;
      }),
      implementCall(DisconnectMcpServer, async ({ serverId }) => { await service.disconnect(serverId); return null; }),
      implementCall(ResetMcpAuth, async ({ serverId }) => {
        await service.disconnect(serverId);
        await plugin.secrets.delete(oauthKey(serverId));
        service.invalidateDirectory(serverId);
        return null;
      }),
    ],
    resources: [implementResource(McpHost, McpHostView, {
      card: mcpCard,
      creation: implementCreation(CreateMcpHost, { create: ({ title }) => ({ title, data: {} }) }),
      project: () => ({ servers: service.states() }),
      inspect: async () => ({ servers: service.list({ offset: 0, limit: 20 }) }),
      attach(_data, object, lifetime) {
        objects.set(object.ref.id, object.ref);
        lifetime.defer(() => { objects.delete(object.ref.id); });
      },
    })],
    tools: [
      implementTool(McpList, { call: (_data, _target, args, { signal }) => readResult(() => service.list(args), signal) }),
      implementTool(McpSearch, { call: (_data, _target, args, { signal }) => readResult(() => service.search(args), signal) }),
      implementTool(McpInspect, { call: (_data, _target, args, { signal }) => readResult(() => service.inspect(args.tool_id), signal) }),
      implementTool(McpConnect, { call: (_data, _target, args, { signal }) => readResult(async () => {
        await service.connectTool(args.server_id, signal);
        return describeServer(service.states().find(state => state.id === args.server_id)!);
      }, signal) }),
      implementTool(McpCall, {
        async call(_data, _target, args, { signal, object, publish }): Promise<CallResult<McpCallData>> {
          let target: CallTarget;
          try { target = service.resolve(args.tool_id); }
          catch (error) { return mcpOutcome(error, signal); }
          const identity = { serverId: target.serverId, serverName: target.serverName, toolName: target.toolName };
          try {
            const result = await service.call(target, args.arguments, signal, progress => {
              // Progress is transient display data; publication failure does not affect the remote call itself.
              try {
                publish({ ...identity, parts: [], progress: { completed: progress.progress,
                  ...(progress.total !== undefined && { total: progress.total }), ...(progress.message && { message: progress.message }) } });
              } catch (error) { plugin.log.warn(`MCP progress could not be published: ${messageOf(error)}`); }
            });
            const data: McpCallData = { ...identity, ...await convertMcpResult(result, object.content) };
            return result.isError ? { kind: "failed", data, error: { code: "tool_error", message: "The MCP server reported a tool error." } }
              : { kind: "succeeded", data };
          } catch (error) {
            // Content conversion failure after the remote response is an internal host error, not a remote request failure.
            if (!(error instanceof McpError || error instanceof McpInterrupted)) throw error;
            return mcpOutcome(error, signal);
          }
        },
        toModel: mcpResultToModel,
      }),
    ],
  };
});
