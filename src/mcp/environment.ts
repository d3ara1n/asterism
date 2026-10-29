import type { DatabaseSync } from "node:sqlite";

export interface McpSecrets {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
export interface McpEnvironment {
  readonly db: DatabaseSync;
  readonly signal: AbortSignal;
  readonly secrets: McpSecrets;
  readonly log: Pick<Console, "warn" | "error">;
}
