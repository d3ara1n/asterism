import { defineModule, implementResource, implementCreation, implementTool, implementCall, type CallResult } from "@atelier/sdk/runtime";
import { type Json, type ResourceRef } from "@atelier/sdk/contracts";
import { McpHost, CreateMcpHost, McpHostView, McpList, McpSearch, McpInspect, McpConnect, McpCall, McpChanged,
  ReadMcp, SaveMcpServer, RemoveMcpServer, ConnectMcpServer, DisconnectMcpServer, ResetMcpAuth, type McpCallData } from "./contract.ts";
import { McpHostService, McpCallError, credentialKey, oauthKey } from "./service.ts";
import { convertMcpResult, mcpResultToModel } from "./result.ts";
import { BuiltinSettings } from "../settings/contract.ts";
import { describeServer } from "./catalog.ts";

async function readResult(work: () => Json | Promise<Json>, signal: AbortSignal): Promise<CallResult> {
  try { signal.throwIfAborted(); return { kind: "succeeded", data: await work() }; }
  catch (error) { return signal.aborted ? { kind: "cancelled", message: "The MCP operation was cancelled." }
    : { kind: "failed", error: { code: "mcp_error", message: error instanceof Error ? error.message : String(error) } }; }
}

export default defineModule(plugin => {
  const config = plugin.config(BuiltinSettings), objects = new Map<string, ResourceRef>();
  const service = new McpHostService(plugin, () => {
    plugin.ipc.events.publish(McpChanged, {});
    for (const ref of objects.values()) plugin.object(ref.sessionId, McpHost, ref.id).invalidate();
  });
  const unsubscribe = config.subscribe(value => service.configure(value.mcp.servers));
  const stop = () => { void service.close().catch(error => plugin.log.error("MCP shutdown failed.", error)); };
  plugin.signal.addEventListener("abort", stop, { once: true });
  // 任务在同步装配完成后启动，状态事件与资源契约已登记。
  plugin.tasks.start("mcp.start", async signal => { await Promise.resolve(); signal.throwIfAborted(); service.configure(config.get().mcp.servers); });
  return {
    events: [McpChanged],
    observers: [{ id: "mcp.presence", resourcesChanged({ appeared, disappeared }) {
      for (const resource of disappeared) if (resource.ref.kind === McpHost.kind) objects.delete(resource.ref.id);
      for (const resource of appeared) if (resource.ref.kind === McpHost.kind) objects.set(resource.ref.id, resource.ref);
    } }],
    calls: [
      implementCall(ReadMcp, async () => service.states()),
      implementCall(SaveMcpServer, async ({ server, credentials }) => {
        if (credentials !== undefined) {
          const exists = config.get().mcp.servers.some(item => item.id === server.id);
          if (exists) await service.disconnect(server.id);
          await plugin.secrets.set(credentialKey(server.id), JSON.stringify(credentials));
        }
        config.update(current => ({ ...current, mcp: { servers: current.mcp.servers.some(item => item.id === server.id)
          ? current.mcp.servers.map(item => item.id === server.id ? server : item) : [...current.mcp.servers, server] } }));
        return null;
      }),
      implementCall(RemoveMcpServer, async ({ serverId }) => {
        await service.disconnect(serverId);
        config.update(current => ({ ...current, mcp: { servers: current.mcp.servers.filter(item => item.id !== serverId) } }));
        await Promise.all([plugin.secrets.delete(credentialKey(serverId)), plugin.secrets.delete(oauthKey(serverId))]);
        return null;
      }),
      implementCall(ConnectMcpServer, async ({ serverId }, { signal }) => { await service.connect(serverId, signal); return null; }),
      implementCall(DisconnectMcpServer, async ({ serverId }) => { await service.disconnect(serverId); return null; }),
      implementCall(ResetMcpAuth, async ({ serverId }) => { await service.resetCredentials(serverId); return null; }),
    ],
    resources: [implementResource(McpHost, McpHostView, {
      creation: implementCreation(CreateMcpHost, { create: ({ title }) => ({ title, data: {} }) }),
      project: () => ({ servers: service.states() }),
      inspect: async () => ({ servers: service.list({ offset: 0, limit: 20 }) }),
    })],
    tools: [
      implementTool(McpList, { call: (_data, _target, args, { signal }) => readResult(() => service.list(args), signal) }),
      implementTool(McpSearch, { call: (_data, _target, args, { signal }) => readResult(() => service.search(args), signal) }),
      implementTool(McpInspect, { call: (_data, _target, args, { signal }) => readResult(() => service.inspect(args.tool_id), signal) }),
      implementTool(McpConnect, { call: (_data, _target, args, { signal }) => readResult(async () => {
        await service.connect(args.server_id, signal);
        return describeServer(service.states().find(state => state.id === args.server_id)!);
      }, signal) }),
      implementTool(McpCall, {
        async call(_data, _target, args, { signal, object, publish }): Promise<CallResult<McpCallData>> {
          try {
            const output = await service.call(args.tool_id, args.arguments, signal, progress => {
              const tool = service.inspect(args.tool_id);
              publish({ serverId: tool.server_id, serverName: tool.server, toolName: tool.name, parts: [],
                progress: { completed: progress.progress, ...(progress.total !== undefined && { total: progress.total }), ...(progress.message && { message: progress.message }) } });
            });
            const data: McpCallData = { serverId: output.serverId, serverName: output.serverName, toolName: output.toolName,
              ...await convertMcpResult(output.result, object.content) };
            return output.result.isError ? { kind: "failed", data, error: { code: "mcp_tool_error", message: "The MCP server reported a tool error." } }
              : { kind: "succeeded", data };
          } catch (error) {
            if (!(error instanceof McpCallError)) throw error;
            if (error.outcome === "unknown" || error.outcome === "cancelled") return { kind: error.outcome, message: error.message };
            return { kind: error.outcome, error: { code: "mcp_call_error", message: error.message } };
          }
        },
        toModel: mcpResultToModel,
      }),
    ],
    async closing() { unsubscribe(); plugin.signal.removeEventListener("abort", stop); await service.close(); },
  };
});
