import type { ConfigurationService } from "../configuration/service.ts";
import type { McpSecrets } from "./environment.ts";

export const mcpSchemaSql = `
  CREATE TABLE mcp_catalog (server_id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, directory TEXT NOT NULL);
`;

/** MCP credential identities belong to the host configuration; values use the application vault. */
export class McpCredentialStore implements McpSecrets {
  constructor(private readonly configuration: ConfigurationService) {}
  async get(key: string): Promise<string | null> {
    const reference = this.configuration.mcpCredentialReference(key);
    return reference ? this.configuration.vault.read(reference) : null;
  }
  /** The replaced reference is read when the new one is committed, so later writes win and release what they replaced. */
  async set(key: string, value: string): Promise<void> {
    const next = await this.configuration.vault.write(value);
    this.replace(key, next);
  }
  async delete(key: string): Promise<void> { this.replace(key, null); }
  private replace(key: string, reference: string | null) {
    const previous = this.configuration.mcpCredentialReference(key);
    this.configuration.setMcpCredentialReference(key, reference);
    if (previous) this.configuration.vault.remove(previous);
  }
}
