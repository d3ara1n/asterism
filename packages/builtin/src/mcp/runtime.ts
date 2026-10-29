import { mcpCard } from "../shared/card-appearance.ts";
import { defineModule, implementResource, implementCreation, implementTool, type CallResult, type McpToolHandle } from "@asterism-app/sdk/runtime";
import { McpError, McpInterrupted, parseMcpToolIdentity, type Json, type ResourceRef } from "@asterism-app/sdk/contracts";
import { McpHost, CreateMcpHost, McpHostView, McpList, McpSearch, McpInspect, McpConnect, McpCall, type McpCallData } from "./contract.ts";
import { mcpErrorCodes } from "./errors.ts";
import { convertMcpResult, mcpResultToModel } from "./result.ts";
import { describeServer, listCatalog, searchCatalog, inspectTool } from "./catalog.ts";

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
  const service = plugin.mcp, objects = new Map<string, ResourceRef>();
  service.subscribe(() => {
    for (const ref of objects.values()) plugin.object(ref.sessionId, McpHost, ref.id).invalidate();
  });
  const catalog = (serverId?: string) => {
    const servers = service.catalog();
    if (serverId) {
      const server = servers.find(item => item.config.id === serverId);
      if (!server) throw new McpError("server_not_found", `The MCP server '${serverId}' is not configured.`);
      if (!server.config.enabled) throw new McpError("server_disabled", `The MCP server '${serverId}' is disabled.`);
    }
    return servers;
  };
  return {
    resources: [implementResource(McpHost, McpHostView, {
      card: mcpCard,
      template: { current: [] },
      creation: implementCreation(CreateMcpHost, { create: ({ title }) => ({ title, data: {} }) }),
      project: () => ({ servers: service.states() }),
      inspect: async () => ({ servers: listCatalog(catalog(), { offset: 0, limit: 20 }) }),
      attach(_data, object, lifetime) {
        objects.set(object.ref.id, object.ref);
        lifetime.defer(() => { objects.delete(object.ref.id); });
      },
    })],
    tools: [
      implementTool(McpList, { call: (_data, _target, args, { signal }) => readResult(() => listCatalog(catalog(args.server_id), args), signal) }),
      implementTool(McpSearch, { call: (_data, _target, args, { signal }) => readResult(() => searchCatalog(catalog(args.server_id), args), signal) }),
      implementTool(McpInspect, { call: (_data, _target, args, { signal }) => readResult(() => {
        const [id, name] = parseMcpToolIdentity(args.tool_id), server = catalog(id).find(item => item.config.id === id)!;
        const tool = server.directory?.tools.find(item => item.name === name);
        if (!tool) throw new McpError("tool_not_found", "The MCP tool is not in the server's cached directory. mcp_connect refreshes it.");
        return inspectTool(server, tool);
      }, signal) }),
      implementTool(McpConnect, { call: (_data, _target, args, { signal }) => readResult(async () => {
        await service.connect(args.server_id, signal);
        return describeServer(service.states().find(state => state.id === args.server_id)!);
      }, signal) }),
      implementTool(McpCall, {
        async call(_data, _target, args, { signal, object, publish }): Promise<CallResult<McpCallData>> {
          let target: McpToolHandle;
          try { target = service.resolve(args.tool_id); }
          catch (error) { return mcpOutcome(error, signal); }
          const identity = { serverId: target.serverId, serverName: target.serverName, toolName: target.toolName };
          try {
            const result = await target.call(args.arguments, { signal, progress: progress => {
              // Progress is transient display data; publication failure does not affect the remote call itself.
              try {
                publish({ ...identity, parts: [], progress: { completed: progress.progress,
                  ...(progress.total !== undefined && { total: progress.total }), ...(progress.message && { message: progress.message }) } });
              } catch (error) { plugin.log.warn(`MCP progress could not be published: ${messageOf(error)}`); }
            } });
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
