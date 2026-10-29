import type { Json } from "./json.ts";
import type { McpCatalogServer, McpServerState } from "./mcp.ts";

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image" | "audio"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string } & ({ text: string } | { blob: string }) }
  | { type: "resource_link"; uri: string; name: string; description?: string };
export interface McpCallResult { content: McpContent[]; structuredContent?: unknown; isError?: boolean }
export interface McpProgress { progress: number; total?: number; message?: string }
/** Bound to the server instance and tool identity captured by resolve. */
export interface McpToolHandle {
  readonly serverId: string;
  readonly serverName: string;
  readonly toolName: string;
  call(args: Record<string, Json>, options: { signal: AbortSignal; progress(value: McpProgress): void }): Promise<McpCallResult>;
}
export interface McpServices {
  states(): McpServerState[];
  catalog(): McpCatalogServer[];
  connect(serverId: string, signal: AbortSignal): Promise<void>;
  resolve(toolId: string): McpToolHandle;
  subscribe(listener: () => void): () => void;
}
