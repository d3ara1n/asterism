/**
 * 五个资源工具共用的错误码：同一原因在任何入口得到相同结局与错误码。
 * 拒绝发生在请求发往远端工具之前，由服务器身份、工具身份或参数决定；失败来自服务状态、连接或远端请求。
 * 前端设置页经 catalog.ts 间接引入本文件，此处不依赖 SDK runtime 入口。
 */
export const mcpErrorCodes = {
  invalid_tool_id: "rejected", server_not_found: "rejected", server_disabled: "rejected",
  tool_not_found: "rejected", invalid_tool_arguments: "rejected",
  service_unavailable: "failed", connection_failed: "failed", authorization_expired: "failed",
  request_failed: "failed", tool_error: "failed",
} as const;
export type McpErrorCode = keyof typeof mcpErrorCodes;

/** 带稳定错误码的 MCP 错误；结局由错误码决定。 */
export class McpError extends Error {
  constructor(readonly code: McpErrorCode, message: string) { super(message); }
}
/** 中止或影响未知的结局不携带错误码。 */
export class McpInterrupted extends Error {
  constructor(readonly outcome: "cancelled" | "unknown", message: string) { super(message); }
}
