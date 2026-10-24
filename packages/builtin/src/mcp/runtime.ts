import { defineModule, implementResource, implementCreation, implementTool, implementCall, PluginApiError, type CallResult } from "@atelier/sdk/runtime";
import { type Json, type ResourceRef } from "@atelier/sdk/contracts";
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
  // 连接池挂在插件生命周期：会话归档或对象移除只注销登记，不断开其他会话仍在使用的连接。
  plugin.lifetime.defer(async () => { unsubscribe(); await service.close(); });
  // 任务在同步装配完成后启动，状态事件与资源契约已登记。
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
        // 新增服务器不继承同 ID 旧服务器遗留的授权；编辑时值有变化才失效目录并以新值重连。
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
      // 设置页的连接在后台进行：等待浏览器授权期间页面其他操作照常可用，结果经状态事件呈现。
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
              // 进度只是临时展示；发布失败不影响远端调用本身。
              try {
                publish({ ...identity, parts: [], progress: { completed: progress.progress,
                  ...(progress.total !== undefined && { total: progress.total }), ...(progress.message && { message: progress.message }) } });
              } catch (error) { plugin.log.warn(`MCP progress could not be published: ${messageOf(error)}`); }
            });
            const data: McpCallData = { ...identity, ...await convertMcpResult(result, object.content) };
            return result.isError ? { kind: "failed", data, error: { code: "tool_error", message: "The MCP server reported a tool error." } }
              : { kind: "succeeded", data };
          } catch (error) {
            // 远端已返回后的内容转换失败属于宿主内部错误，不伪装成远端请求失败。
            if (!(error instanceof McpError || error instanceof McpInterrupted)) throw error;
            return mcpOutcome(error, signal);
          }
        },
        toModel: mcpResultToModel,
      }),
    ],
  };
});
