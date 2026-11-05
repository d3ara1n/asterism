import type { ConfigurationService } from "../configuration/service.ts";
import type { McpAuthorization, McpAuthorizations } from "./environment.ts";

export const mcpSchemaSql = `
  CREATE TABLE mcp_catalog (server_id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, directory TEXT NOT NULL);
`;

/** OAuth state lives in host configuration beside the server configuration it belongs to. */
export class McpAuthorizationStore implements McpAuthorizations {
  constructor(private readonly configuration: ConfigurationService) {}
  get(serverId: string) { return this.configuration.mcpAuthorization(serverId); }
  set(serverId: string, value: McpAuthorization) { this.configuration.setMcpAuthorization(serverId, value); }
  delete(serverId: string) { this.configuration.setMcpAuthorization(serverId, null); }
}
