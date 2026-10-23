import { z } from "zod";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import { SERVER_ID_PATTERN, type McpServerConfig, type McpServerState } from "./contract.ts";

export const cachedToolSchema = z.object({
  name: z.string(), title: z.string().optional(), description: z.string().optional(),
  inputSchema: z.record(z.string(), jsonSchema), outputSchema: z.record(z.string(), jsonSchema).optional(),
  annotations: z.record(z.string(), jsonSchema).optional(),
});
export type CachedTool = z.infer<typeof cachedToolSchema>;
export const directorySchema = z.object({ tools: z.array(cachedToolSchema), instructions: z.string().optional() });
export type Directory = z.infer<typeof directorySchema>;
export interface CatalogServer { config: McpServerConfig; state: McpServerState; directory?: Directory }

/** 服务器 ID 不含 `/`，句柄按第一个 `/` 切分；远端工具名自身可以包含 `/`。 */
export function toolIdentity(serverId: string, name: string): string { return `${serverId}/${name}`; }
export function parseToolIdentity(value: string): [string, string] {
  const split = value.indexOf("/");
  const serverId = value.slice(0, split), name = value.slice(split + 1);
  if (split < 1 || !name || !SERVER_ID_PATTERN.test(serverId)) throw new Error("tool_id uses the form server_id/tool_name.");
  return [serverId, name];
}

/** 名称生成的默认 ID；无法转写的名称回落到 server，并以数字后缀避开已有 ID。 */
export function slugifyServerId(name: string, taken: Iterable<string>): string {
  const base = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "server";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let index = 2; ; index++) if (!used.has(`${base}-${index}`)) return `${base}-${index}`;
}

export function pageOf<T extends Json>(items: T[], offset: number, limit: number) {
  return { items: items.slice(offset, offset + limit), total: items.length, next_offset: offset + limit < items.length ? offset + limit : null };
}
const clip = (text: string, length: number) => text.replace(/\s+/gu, " ").trim().slice(0, length);
function brief(server: CatalogServer, tool: CachedTool) {
  return { tool_id: toolIdentity(server.config.id, tool.name), server_id: server.config.id, server: server.config.name, name: tool.name,
    ...(tool.title && { title: tool.title }), description: clip(tool.description ?? "", 240) };
}
/** 模型侧只消费发现所需状态，浏览器授权地址留在设置界面。 */
export function describeServer(state: McpServerState) {
  return { server_id: state.id, name: state.name, description: clip(state.description, 240), enabled: state.enabled,
    mode: state.mode, connection: state.connection, indexed: state.indexed, tool_count: state.toolCount,
    error: state.error?.slice(0, 500) ?? null };
}
export function listCatalog(servers: CatalogServer[], args: { server_id?: string; offset: number; limit: number }) {
  if (!args.server_id) return pageOf(servers.map(server => describeServer(server.state)), args.offset, args.limit);
  const server = servers.find(item => item.config.id === args.server_id);
  if (!server) throw new Error("The MCP server is unavailable.");
  return { server: describeServer(server.state), ...pageOf((server.directory?.tools ?? []).map(tool => brief(server, tool)), args.offset, args.limit) };
}
export function inspectTool(server: CatalogServer, tool: CachedTool) {
  return { tool_id: toolIdentity(server.config.id, tool.name), server_id: server.config.id, server: server.config.name, ...tool,
    ...(server.directory?.instructions ? { server_instructions: server.directory.instructions } : {}) };
}

function terms(query: string) { return query.toLocaleLowerCase().split(/[\s/_.:-]+/u).filter(Boolean); }
function score(query: string[], name: string, server: string, description: string): number {
  const n = name.toLocaleLowerCase(), s = server.toLocaleLowerCase(), d = description.toLocaleLowerCase();
  return query.reduce((total, word) => total + (n.includes(word) ? 8 : 0) + (s.includes(word) ? 4 : 0) + (d.includes(word) ? 1 : 0), 0);
}
/** 工具命中按 offset/limit 分页；未索引服务器只随第一页交付，完整服务器清单由 list 提供。 */
export function searchCatalog(all: CatalogServer[], args: { query: string; server_id?: string; offset: number; limit: number }) {
  const servers = all.filter(server => server.config.enabled && (!args.server_id || server.config.id === args.server_id));
  const words = terms(args.query);
  const ranked = servers.flatMap(server => (server.directory?.tools ?? []).map(tool => ({ entry: brief(server, tool),
    score: score(words, `${tool.name} ${tool.title ?? ""}`, `${server.config.name} ${server.config.description}`, tool.description ?? "") })))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.entry.tool_id.localeCompare(b.entry.tool_id));
  const unindexed = servers.filter(server => !server.directory).map(server => ({ server,
    score: score(words, server.config.name, "", server.config.description) }))
    .sort((a, b) => b.score - a.score || a.server.config.id.localeCompare(b.server.config.id));
  return { matches: pageOf(ranked.map(item => item.entry), args.offset, args.limit),
    unindexed_servers: (args.offset === 0 ? unindexed.slice(0, args.limit) : []).map(({ server }) => ({ server_id: server.config.id, name: server.config.name,
      description: clip(server.config.description, 240), connection: server.state.connection })),
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
/** 每行一个 argv；文本末尾的空行来自换行符，不构成参数，中间的空行是显式的空参数。 */
export function parseArgumentLines(text: string): string[] {
  const lines = text.split(/\r?\n/u);
  while (lines.length && !lines.at(-1)) lines.pop();
  return lines;
}
