/**
 * Error codes shared by the five resource tools: the same cause produces the same outcome and error code at every entry point.
 * Rejection occurs before a request reaches the remote tool and is determined by server identity, tool identity, or arguments; failures arise from service state, connections, or remote requests.
 * The frontend settings page imports this file indirectly through catalog.ts; this file does not depend on the SDK runtime entry point.
 */
export const mcpErrorCodes = {
  invalid_tool_id: "rejected", server_not_found: "rejected", server_disabled: "rejected",
  tool_not_found: "rejected", invalid_tool_arguments: "rejected",
  service_unavailable: "failed", connection_failed: "failed", authorization_expired: "failed",
  request_failed: "failed", tool_error: "failed",
} as const;
export type McpErrorCode = keyof typeof mcpErrorCodes;

/** MCP error with a stable error code; the code determines the outcome. */
export class McpError extends Error {
  constructor(readonly code: McpErrorCode, message: string) { super(message); }
}
/** Aborted outcomes and outcomes with unknown effects carry no error code. */
export class McpInterrupted extends Error {
  constructor(readonly outcome: "cancelled" | "unknown", message: string) { super(message); }
}
