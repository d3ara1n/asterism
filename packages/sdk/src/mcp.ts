import { z } from "zod";
import { defineCall } from "./calls.ts";
import { defineEvent } from "./events.ts";
import { jsonSchema } from "./json.ts";

export const SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/u;
export const serverIdSchema = z.string().min(1).max(64).regex(SERVER_ID_PATTERN);
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
export const mcpSettingsSchema = z.object({ servers: z.array(mcpServerSchema).refine(values =>
  new Set(values.map(value => value.id)).size === values.length, "Server IDs are unique.") });
export const defaultMcpSettings = { servers: [] };
export const credentialsSchema = z.record(z.string(), z.string());
export const connectionPhases = ["disconnected", "connecting", "awaiting_auth", "authorizing", "connected", "error"] as const;
export type ConnectionPhase = typeof connectionPhases[number];
export const mcpServerStateSchema = z.object({
  id: z.string(), name: z.string(), enabled: z.boolean(), mode: z.enum(["eager", "lazy"]),
  connection: z.enum(connectionPhases),
  indexed: z.boolean(), toolCount: z.number(), error: z.string().nullable(), authorizationUrl: z.string().nullable(),
  authorizationExpiresAt: z.number().nullable(),
});
export type McpServerState = z.infer<typeof mcpServerStateSchema>;
export const cachedMcpToolSchema = z.object({
  name: z.string(), title: z.string().optional(), description: z.string().optional(),
  inputSchema: z.record(z.string(), jsonSchema), outputSchema: z.record(z.string(), jsonSchema).optional(),
  annotations: z.record(z.string(), jsonSchema).optional(),
});
export type CachedMcpTool = z.infer<typeof cachedMcpToolSchema>;
export const mcpDirectorySchema = z.object({ tools: z.array(cachedMcpToolSchema), instructions: z.string().optional() });
export type McpDirectory = z.infer<typeof mcpDirectorySchema>;
export interface McpCatalogServer { config: McpServerConfig; state: McpServerState; directory?: McpDirectory }

export const McpChanged = defineEvent("core.mcp.changed", { schema: z.object({}), source: "host", semantics: { kind: "snapshot", key: [] } });
export const ReadMcp = defineCall("core.mcp.status", { scope: "plugin", input: z.object({}), output: z.array(mcpServerStateSchema) });
/** keep retains saved environment or headers; a new server with keep starts without any. */
export const mcpCredentialUpdateSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("keep") }), z.strictObject({ action: z.literal("replace"), values: credentialsSchema }),
]);
export type McpCredentialUpdate = z.infer<typeof mcpCredentialUpdateSchema>;
export const SaveMcpServer = defineCall("core.mcp.save-server", { scope: "plugin",
  input: z.object({ server: mcpServerSchema, create: z.boolean(), credentials: mcpCredentialUpdateSchema }), output: z.null() });
export const ReadMcpCredentials = defineCall("core.mcp.read-credentials", { scope: "plugin", input: z.object({ serverId: z.string() }), output: credentialsSchema });
export const mcpToolSummarySchema = z.object({ name: z.string(), title: z.string().optional(), description: z.string().optional() });
export type McpToolSummary = z.infer<typeof mcpToolSummarySchema>;
export const ReadMcpTools = defineCall("core.mcp.read-tools", { scope: "plugin", input: z.object({ serverId: z.string() }),
  output: z.object({ tools: z.array(mcpToolSummarySchema), instructions: z.string().optional() }).nullable() });
export const SetMcpServerEnabled = defineCall("core.mcp.set-enabled", { scope: "plugin", input: z.object({ serverId: z.string(), enabled: z.boolean() }), output: z.null() });
export const RemoveMcpServer = defineCall("core.mcp.remove-server", { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });
export const ConnectMcpServer = defineCall("core.mcp.connect-server", { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });
export const AuthorizeMcpServer = defineCall("core.mcp.authorize-server", { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.object({ url: z.string() }) });
export const DisconnectMcpServer = defineCall("core.mcp.disconnect-server", { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });
export const ResetMcpAuth = defineCall("core.mcp.reset-auth", { scope: "plugin", input: z.object({ serverId: z.string() }), output: z.null() });

export type McpErrorCode = "invalid_tool_id" | "server_not_found" | "server_disabled" | "tool_not_found" | "invalid_tool_arguments"
  | "service_unavailable" | "connection_failed" | "authorization_expired" | "request_failed" | "tool_error";
export class McpError extends Error {
  readonly code: McpErrorCode;
  constructor(code: McpErrorCode, message: string) { super(message); this.code = code; }
}
export class McpInterrupted extends Error {
  readonly outcome: "cancelled" | "unknown";
  constructor(outcome: "cancelled" | "unknown", message: string) { super(message); this.outcome = outcome; }
}
export function mcpToolIdentity(serverId: string, name: string): string { return `${serverId}/${name}`; }
export function parseMcpToolIdentity(value: string): [string, string] {
  const split = value.indexOf("/"), serverId = value.slice(0, split), name = value.slice(split + 1);
  if (split < 1 || !name || !SERVER_ID_PATTERN.test(serverId)) throw new McpError("invalid_tool_id", "Tool identity uses the form server_id/tool_name.");
  return [serverId, name];
}
