import { z } from "zod";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import type { McpServerConfig, McpServerState } from "./contract.ts";

export const cachedToolSchema = z.object({ name: z.string(), description: z.string().optional(), inputSchema: z.record(z.string(), jsonSchema), outputSchema: z.record(z.string(), jsonSchema).optional() });
export type CachedTool = z.infer<typeof cachedToolSchema>;
export const directorySchema = z.object({ tools: z.array(cachedToolSchema), instructions: z.string().optional() });
export type Directory = z.infer<typeof directorySchema>;
export interface CatalogServer { config: McpServerConfig; state: McpServerState; directory?: Directory }

/** JSON 元组避免服务器 ID 和远端名称中的分隔符产生歧义。 */
export function toolIdentity(serverId: string, name: string): string { return JSON.stringify([serverId, name]); }
export function parseToolIdentity(value: string): [string, string] {
  return z.tuple([z.string().min(1), z.string().min(1)]).parse(JSON.parse(value));
}
export function pageOf<T extends Json>(items: T[], offset: number, limit: number) {
  return { items: items.slice(offset, offset + limit), total: items.length, next_offset: offset + limit < items.length ? offset + limit : null };
}
function brief(server: CatalogServer, tool: CachedTool) {
  return { tool_id: toolIdentity(server.config.id, tool.name), server_id: server.config.id, server: server.config.name, name: tool.name,
    description: (tool.description ?? "").replace(/\s+/gu, " ").slice(0, 240) };
}
/** 模型侧只消费发现所需状态，浏览器授权地址留在设置界面。 */
export function describeServer(state: McpServerState) {
  return { server_id: state.id, name: state.name, description: state.description.slice(0, 240), enabled: state.enabled,
    mode: state.mode, connection: state.connection, indexed: state.indexed, tool_count: state.toolCount,
    error: state.error?.slice(0, 500) ?? null };
}
export function listCatalog(servers: CatalogServer[], args: { server_id?: string; offset: number; limit: number }) {
  if (!args.server_id) return pageOf(servers.map(server => describeServer(server.state)), args.offset, args.limit);
  const server = servers.find(item => item.config.id === args.server_id);
  if (!server) throw new Error("The MCP server is unavailable.");
  return { server: describeServer(server.state), ...pageOf((server.directory?.tools ?? []).map(tool => brief(server, tool)), args.offset, args.limit) };
}
function terms(query: string) { return query.toLocaleLowerCase().split(/[\s/_.:-]+/u).filter(Boolean); }
function score(query: string[], name: string, server: string, description: string): number {
  const n = name.toLocaleLowerCase(), s = server.toLocaleLowerCase(), d = description.toLocaleLowerCase();
  return query.reduce((total, word) => total + (n.includes(word) ? 8 : 0) + (s.includes(word) ? 4 : 0) + (d.includes(word) ? 1 : 0), 0);
}
export function searchCatalog(all: CatalogServer[], args: { query: string; server_id?: string; offset: number; limit: number }) {
  const servers = all.filter(server => server.config.enabled && (!args.server_id || server.config.id === args.server_id));
  const words = terms(args.query);
  const ranked = servers.flatMap(server => (server.directory?.tools ?? []).map(tool => ({ entry: brief(server, tool),
    score: score(words, tool.name, `${server.config.name} ${server.config.description}`, tool.description ?? "") })))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.entry.tool_id.localeCompare(b.entry.tool_id));
  // 未索引服务器始终交付，名称相关项优先；已有工具命中也不隐去发现入口。
  const unindexed = servers.filter(server => !server.directory).sort((a, b) =>
    score(words, b.config.name, "", b.config.description) - score(words, a.config.name, "", a.config.description));
  return { matches: pageOf(ranked.map(item => item.entry), args.offset, args.limit),
    unindexed_servers: pageOf(unindexed.map(server => ({ server_id: server.config.id, name: server.config.name,
      description: server.config.description.slice(0, 240), connection: server.state.connection })), args.offset, args.limit),
    coverage: { indexed_servers: servers.length - unindexed.length, unindexed_servers: unindexed.length } };
}

/** 表单逐行输入 KEY=VALUE；值中的等号和空白保持原样。 */
export function parseCredentialLines(text: string): Record<string, string> {
  return Object.fromEntries(text.split(/\r?\n/u).filter(line => line.trim()).map(line => {
    const split = line.indexOf("=");
    if (split < 1 || !line.slice(0, split).trim()) throw new Error("Each entry uses KEY=VALUE.");
    return [line.slice(0, split).trim(), line.slice(split + 1)];
  }));
}
