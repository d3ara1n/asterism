import type { DatabaseSync } from "node:sqlite";

/** OAuth state the client writes for one server: registration, tokens, and callback port. */
export type McpAuthorization = Readonly<Record<string, unknown>>;
export interface McpAuthorizations {
  get(serverId: string): McpAuthorization | null;
  set(serverId: string, value: McpAuthorization): void;
  delete(serverId: string): void;
}
export interface McpEnvironment {
  readonly db: DatabaseSync;
  readonly signal: AbortSignal;
  readonly authorizations: McpAuthorizations;
  /** Resolve a user-entered environment or header value, including `!` credential commands. */
  resolveCredential(value: string, signal: AbortSignal): Promise<string>;
  readonly log: Pick<Console, "warn" | "error">;
}
