import { z } from "zod";
import { defineCreation, defineImplementation, defineTool, jsonSchema, modelInputPartsSchema, mcpServerStateSchema, type Json } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const McpHost = builtin.resource("mcp", z.object({}));
export const CreateMcpHost = defineCreation(McpHost, { id: builtin.name("mcp.create"), schema: z.object({ title: z.string().trim().min(1).default("MCP Host") }) });
export const McpHostView = builtin.data("mcp.card", z.object({ servers: z.array(mcpServerStateSchema) }));

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
