import { z } from "zod";
import { defineCall, defineCreation, defineImplementation, defineTool, jsonSchema, modelInputPartsSchema, type Json } from "@asterism/sdk/contracts";
import { builtin } from "@asterism/builtin-api/contracts";

/** 服务器 ID 是创建时确定的可读 slug，与远端工具名组成 `server_id/tool_name` 句柄；名称可随时修改。 */
export const SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/u;
export const serverIdSchema = z.string().min(1).max(64).regex(SERVER_ID_PATTERN);

/** 连接参数由星图管理，环境变量与 HTTP 请求头单独进入凭据存储。 */
export const mcpServerSchema = z.strictObject({
  id: serverIdSchema, name: z.string().trim().min(1), enabled: z.boolean(),
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
export const connectionPhases = ["disconnected", "connecting", "awaiting_auth", "connected", "error"] as const;
export type ConnectionPhase = typeof connectionPhases[number];
export const mcpServerStateSchema = z.object({
  id: z.string(), name: z.string(), enabled: z.boolean(), mode: z.enum(["eager", "lazy"]),
  connection: z.enum(connectionPhases),
  indexed: z.boolean(), toolCount: z.number(), error: z.string().nullable(), authorizationUrl: z.string().nullable(),
});
export type McpServerState = z.infer<typeof mcpServerStateSchema>;
export const McpHost = builtin.resource("mcp", z.object({}));
export const CreateMcpHost = defineCreation(McpHost, { id: builtin.name("mcp.create"), schema: z.object({ title: z.string().trim().min(1).default("MCP Host") }) });
export const McpHostView = builtin.data("mcp.card", z.object({ servers: z.array(mcpServerStateSchema) }));
export const McpChanged = builtin.event("mcp.changed", { schema: z.object({}), source: "plugin", semantics: { kind: "snapshot", key: [] } });
export const ReadMcp = defineCall(builtin.name("mcp.status"), { scope: "plugin", input: z.object({}), output: z.array(mcpServerStateSchema) });
/** 编辑表单整块写回环境变量／请求头；create 区分新增与编辑，新增遇到已有 ID 时拒绝。 */
export const SaveMcpServer = defineCall(builtin.name("mcp.save-server"), { scope: "plugin",
  input: z.object({ server: mcpServerSchema, create: z.boolean(), credentials: credentialsSchema }), output: z.null() });
/** 设置页读回自己保存的环境变量／请求头明文；vault 只保证落盘加密。 */
export const ReadMcpCredentials = defineCall(builtin.name("mcp.read-credentials"), { scope: "plugin", input: z.object({ serverId: z.string() }), output: credentialsSchema });
export const mcpToolSummarySchema = z.object({ name: z.string(), title: z.string().optional(), description: z.string().optional() });
export type McpToolSummary = z.infer<typeof mcpToolSummarySchema>;
/** 缓存目录的展示摘要；未建立目录时为 null。 */
export const ReadMcpTools = defineCall(builtin.name("mcp.read-tools"), { scope: "plugin", input: z.object({ serverId: z.string() }),
  output: z.object({ tools: z.array(mcpToolSummarySchema), instructions: z.string().optional() }).nullable() });
export const SetMcpServerEnabled = defineCall(builtin.name("mcp.set-enabled"), { scope: "plugin", input: z.object({ serverId: z.string(), enabled: z.boolean() }), output: z.null() });
export const RemoveMcpServer = defineCall(builtin.name("mcp.remove-server"), { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });
export const ConnectMcpServer = defineCall(builtin.name("mcp.connect-server"), { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });
export const DisconnectMcpServer = defineCall(builtin.name("mcp.disconnect-server"), { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });
export const ResetMcpAuth = defineCall(builtin.name("mcp.reset-auth"), { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });

const page = { offset: z.number().int().nonnegative().default(0).describe("Zero-based offset in the matching entries."), limit: z.number().int().min(1).max(50).default(20).describe("Maximum entries returned in this page.") };
const serverId = z.string().min(1).describe("Server ID returned by mcp_list or mcp_search.");
const toolId = z.string().min(1).describe("Tool ID in the form server_id/tool_name, as returned by mcp_list or mcp_search.");
const targetSchema = z.null().describe("The MCP Host resource selects the shared server collection.");
const resultSchema = jsonSchema.describe("MCP directory entries, connection state, or operation result.");
function tool<A extends Json>(name: string, description: string, argsSchema: z.ZodType<A>, effect: "read" | "write" = "read") {
  return defineImplementation({ ...builtin.data(`mcp.${name}`, resultSchema), resource: McpHost,
    tool: defineTool({ id: builtin.name(`mcp.tool.${name}`), name: `mcp_${name}`, description, guidelines: [], argsSchema }),
    targetSchema, effect, execution: effect === "read" ? "parallel" : "sequential" });
}
export const McpList = tool("list", "Browse MCP servers and compact cached tool entries. Without server_id, returns servers with their connection and indexing state; with server_id, returns that server's cached tools.", z.object({ server_id: serverId.optional(), ...page }).describe("Optional server and page to browse."));
export const McpSearch = tool("search", "Search cached MCP tool names, titles, server names and descriptions. The first page also lists enabled servers whose tools are not indexed yet; mcp_connect indexes them. Full schemas are available through mcp_inspect.", z.object({ query: z.string().trim().min(1).describe("Keywords describing the task, server, or tool."), server_id: serverId.optional(), ...page }).describe("Search keywords, optional server, and page."));
export const McpInspect = tool("inspect", "Read the complete cached description, input and output schemas, and annotations of one MCP tool, with the server's instructions.", z.object({ tool_id: toolId }).describe("The tool to inspect."));
export const McpConnect = tool("connect", "Connect to an MCP server and refresh its cached tool directory; a connected server refreshes in place. A server awaiting OAuth completes the connection after the user authorizes it in MCP settings.", z.object({ server_id: serverId }).describe("The server to connect or refresh."), "write");
export const mcpCallDataSchema = z.object({ serverId: z.string(), serverName: z.string(), toolName: z.string(),
  parts: modelInputPartsSchema, structuredContent: jsonSchema.optional(), progress: z.object({ completed: z.number(), total: z.number().optional(), message: z.string().optional() }).optional(),
}).describe("Remote tool identity, result content, structured output, and temporary progress.");
export type McpCallData = z.infer<typeof mcpCallDataSchema>;
export const McpCall = defineImplementation({ ...builtin.data("mcp.call", mcpCallDataSchema), resource: McpHost,
  tool: defineTool({ id: builtin.name("mcp.tool.call"), name: "mcp_call",
    description: "Call an MCP tool with its structured arguments. MCP servers are external services: their directory, availability and results reflect the server at call time. Lazy servers connect on demand; a server awaiting OAuth runs the call after the user authorizes it in MCP settings.",
    guidelines: [],
    argsSchema: z.object({ tool_id: toolId, arguments: z.record(z.string(), jsonSchema).describe("Arguments matching the selected MCP tool's input schema.") }).describe("Selected MCP tool and its arguments.") }),
  targetSchema, effect: "write", execution: "sequential" });
