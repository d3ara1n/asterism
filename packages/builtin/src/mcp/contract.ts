import { z } from "zod";
import { defineCall, defineCreation, defineImplementation, defineTool, jsonSchema, modelInputPartsSchema } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

/** 连接参数由工坊管理，环境变量与 HTTP 请求头单独进入凭据存储。 */
export const mcpServerSchema = z.strictObject({
  id: z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/u), name: z.string().trim().min(1), description: z.string(), enabled: z.boolean(),
  mode: z.enum(["eager", "lazy"]), idleSeconds: z.number().int().min(1).max(86_400),
  transport: z.enum(["stdio", "http"]), command: z.string(), args: z.array(z.string()), cwd: z.string(),
  url: z.string(), auth: z.enum(["none", "oauth"]),
}).superRefine((value, ctx) => {
  if (value.transport === "stdio" && !value.command.trim()) ctx.addIssue({ code: "custom", path: ["command"], message: "An executable is required." });
  if (value.transport === "http") {
    try { const url = new URL(value.url); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
    catch { ctx.addIssue({ code: "custom", path: ["url"], message: "An HTTP or HTTPS MCP URL is required." }); }
  }
});
export type McpServerConfig = z.infer<typeof mcpServerSchema>;
export const mcpSettingsSchema = z.object({ servers: z.array(mcpServerSchema).refine(values => new Set(values.map(value => value.id)).size === values.length, "Server IDs are unique.") });
export const defaultMcpSettings = { servers: [] };
export const credentialsSchema = z.record(z.string(), z.string());
export const mcpServerStateSchema = z.object({
  id: z.string(), name: z.string(), description: z.string(), enabled: z.boolean(), mode: z.enum(["eager", "lazy"]),
  connection: z.enum(["disconnected", "connecting", "connected", "awaiting_auth", "error"]),
  indexed: z.boolean(), toolCount: z.number(), error: z.string().nullable(), authorizationUrl: z.string().nullable(),
});
export type McpServerState = z.infer<typeof mcpServerStateSchema>;
export const McpHost = builtin.resource("mcp", z.object({}));
export const CreateMcpHost = defineCreation(McpHost, { id: builtin.name("mcp.create"), schema: z.object({ title: z.string().trim().min(1).default("MCP Host") }) });
export const McpHostView = builtin.data("mcp.card", z.object({ servers: z.array(mcpServerStateSchema) }));
export const McpChanged = builtin.event("mcp.changed", { schema: z.object({}), source: "plugin", semantics: { kind: "snapshot", key: [] } });
export const ReadMcp = defineCall(builtin.name("mcp.status"), { scope: "plugin", input: z.object({}), output: z.array(mcpServerStateSchema) });
export const SaveMcpServer = defineCall(builtin.name("mcp.save-server"), { scope: "plugin", input: z.object({ server: mcpServerSchema, credentials: credentialsSchema.optional() }), output: z.null() });
export const RemoveMcpServer = defineCall(builtin.name("mcp.remove-server"), { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });
export const ConnectMcpServer = defineCall(builtin.name("mcp.connect-server"), { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });
export const DisconnectMcpServer = defineCall(builtin.name("mcp.disconnect-server"), { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });
export const ResetMcpAuth = defineCall(builtin.name("mcp.reset-auth"), { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });

const page = { offset: z.number().int().nonnegative().default(0).describe("Zero-based offset in the matching entries."), limit: z.number().int().min(1).max(50).default(20).describe("Maximum entries returned in this page.") };
const serverId = z.string().min(1).describe("Stable server ID returned by mcp_list or mcp_search.");
const toolId = z.string().min(1).describe("Opaque tool ID returned by mcp_list or mcp_search.");
const targetSchema = z.null().describe("The MCP Host resource selects the shared server collection.");
const resultSchema = jsonSchema.describe("MCP directory entries, connection state, or operation result.");
function tool<A extends import("@atelier/sdk/contracts").Json>(name: string, description: string, argsSchema: z.ZodType<A>, effect: "read" | "write" = "read") {
  return defineImplementation({ ...builtin.data(`mcp.${name}`, resultSchema), resource: McpHost,
    tool: defineTool({ id: builtin.name(`mcp.tool.${name}`), name: `mcp_${name}`, description, guidelines: [], argsSchema }),
    targetSchema, effect, execution: effect === "read" ? "parallel" : "sequential" });
}
export const McpList = tool("list", "Browse MCP servers and compact cached tool entries. Without server_id, returns servers and their connection and indexing state; with server_id, returns that server's tools.", z.object({ server_id: serverId.optional(), ...page }).describe("Optional server and page to browse."));
export const McpSearch = tool("search", "Search cached MCP tool names, server names, and descriptions. Results include servers with no indexed tools and directory coverage; mcp_connect discovers those servers. Full schemas are available through mcp_inspect.", z.object({ query: z.string().trim().min(1).describe("Keywords describing the task, server, or tool."), server_id: serverId.optional(), ...page }).describe("Search keywords, optional server, and page."));
export const McpInspect = tool("inspect", "Read the complete cached description and input schema of one MCP tool.", z.object({ tool_id: toolId }).describe("The tool to inspect."));
export const McpConnect = tool("connect", "Connect to an MCP server and refresh its cached tool directory. An already connected server refreshes its directory. OAuth authorization is completed in MCP settings.", z.object({ server_id: serverId }).describe("The server to connect or refresh."), "write");
export const mcpCallDataSchema = z.object({ serverId: z.string(), serverName: z.string(), toolName: z.string(),
  parts: modelInputPartsSchema, structuredContent: jsonSchema.optional(), progress: z.object({ completed: z.number(), total: z.number().optional(), message: z.string().optional() }).optional(),
}).describe("Remote tool identity, result content, structured output, and temporary progress.");
export type McpCallData = z.infer<typeof mcpCallDataSchema>;
export const McpCall = defineImplementation({ ...builtin.data("mcp.call", mcpCallDataSchema), resource: McpHost,
  tool: defineTool({ id: builtin.name("mcp.tool.call"), name: "mcp_call", description: "Call an MCP tool with its structured arguments. Lazy servers connect on demand. Tool identity and input schema are available through mcp_search and mcp_inspect.", guidelines: [],
    argsSchema: z.object({ tool_id: toolId, arguments: z.record(z.string(), jsonSchema).describe("Arguments matching the selected MCP tool's input schema.") }).describe("Selected MCP tool and its arguments.") }),
  targetSchema, effect: "write", execution: "sequential" });
