import { McpError, mcpToolIdentity as toolIdentity, type Json, type McpServerState,
  type CachedMcpTool as CachedTool, type McpCatalogServer as CatalogServer } from "@asterism-app/sdk/contracts";

export function pageOf<T extends Json>(items: T[], offset: number, limit: number) {
  return { items: items.slice(offset, offset + limit), total: items.length, next_offset: offset + limit < items.length ? offset + limit : null };
}
const clip = (text: string, length: number) => text.replace(/\s+/gu, " ").trim().slice(0, length);
function brief(server: CatalogServer, tool: CachedTool) {
  return { tool_id: toolIdentity(server.config.id, tool.name), server_id: server.config.id, server: server.config.name, name: tool.name,
    ...(tool.title && { title: tool.title }), description: clip(tool.description ?? "", 240) };
}
/** The model consumes only the state needed for discovery; browser authorization URLs stay in the settings UI. */
export function describeServer(state: McpServerState) {
  return { server_id: state.id, name: state.name, enabled: state.enabled,
    mode: state.mode, connection: state.connection, indexed: state.indexed, tool_count: state.toolCount,
    error: state.error?.slice(0, 500) ?? null };
}
export function listCatalog(servers: CatalogServer[], args: { server_id?: string; offset: number; limit: number }) {
  if (!args.server_id) return pageOf(servers.map(server => describeServer(server.state)), args.offset, args.limit);
  const server = servers.find(item => item.config.id === args.server_id);
  if (!server) throw new McpError("server_not_found", `The MCP server '${args.server_id}' is not configured.`);
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
/** Tool matches are paginated by offset/limit; unindexed servers are delivered only with the first page. list provides the complete server list. */
export function searchCatalog(all: CatalogServer[], args: { query: string; server_id?: string; offset: number; limit: number }) {
  const servers = all.filter(server => server.config.enabled && (!args.server_id || server.config.id === args.server_id));
  const words = terms(args.query);
  const ranked = servers.flatMap(server => (server.directory?.tools ?? []).map(tool => ({ entry: brief(server, tool),
    score: score(words, `${tool.name} ${tool.title ?? ""}`, server.config.name, tool.description ?? "") })))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.entry.tool_id.localeCompare(b.entry.tool_id));
  const unindexed = servers.filter(server => !server.directory).map(server => ({ server,
    score: score(words, server.config.name, "", "") }))
    .sort((a, b) => b.score - a.score || a.server.config.id.localeCompare(b.server.config.id));
  return { matches: pageOf(ranked.map(item => item.entry), args.offset, args.limit),
    unindexed_servers: (args.offset === 0 ? unindexed.slice(0, args.limit) : []).map(({ server }) => ({ server_id: server.config.id, name: server.config.name, connection: server.state.connection })),
    coverage: { indexed_servers: servers.length - unindexed.length, unindexed_servers: unindexed.length } };
}
