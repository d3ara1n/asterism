import type { DatabaseSync } from "node:sqlite";
import { defaultAgents, defaultRoles } from "./defaults.ts";

export type ConfigurationKind = "provider" | "model" | "role" | "agent";
export interface ConfigurationRow {
  kind: ConfigurationKind; id: string; revision: number; data_json: string; builtin: number; credential_ref: string | null;
}
export class ConfigurationError extends Error {
  constructor(readonly code: "invalid_request" | "not_found" | "conflict" | "unavailable" | "internal", message: string) { super(message); }
}

/** 配置之间不建外键，不检查引用图；调用方在取用时解析配置。 */
export class ConfigurationRepository {
  constructor(private readonly db: DatabaseSync) {
    if (!db.prepare("SELECT id FROM configuration_state WHERE id = 1").get()) this.transaction(() => {
      for (const [kind, items] of [["role", defaultRoles], ["agent", defaultAgents]] as const) {
        for (const { id, builtin, ...data } of items) {
          db.prepare("INSERT INTO configuration_items (kind, id, revision, data_json, builtin) VALUES (?, ?, 1, ?, ?)").run(kind, id, JSON.stringify(data), builtin ? 1 : 0);
        }
      }
      db.prepare("INSERT INTO configuration_state VALUES (1)").run();
    });
  }
  list(kind: ConfigurationKind): ConfigurationRow[] {
    return this.db.prepare("SELECT * FROM configuration_items WHERE kind = ? ORDER BY rowid").all(kind) as unknown as ConfigurationRow[];
  }
  get(kind: ConfigurationKind, id: string): ConfigurationRow | null {
    return this.db.prepare("SELECT * FROM configuration_items WHERE kind = ? AND id = ?").get(kind, id) as unknown as ConfigurationRow ?? null;
  }
  save(kind: ConfigurationKind, id: string, data: unknown, credentialRef: string | null = null): void {
    const old = this.get(kind, id);
    this.db.prepare(`INSERT INTO configuration_items (kind, id, revision, data_json, builtin, credential_ref) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, id) DO UPDATE SET revision = excluded.revision, data_json = excluded.data_json, credential_ref = excluded.credential_ref`)
      .run(kind, id, (old?.revision ?? 0) + 1, JSON.stringify(data), old?.builtin ?? 0, credentialRef);
  }
  remove(kind: ConfigurationKind, id: string): ConfigurationRow {
    const old = this.get(kind, id);
    if (!old) throw new ConfigurationError("not_found", "This configuration no longer exists.");
    if (kind === "role" && old.builtin) throw new ConfigurationError("invalid_request", "Built-in model roles cannot be deleted.");
    this.transaction(() => {
      // 提供商拥有具体模型；删除它的模型数据，不更新任何角色或会话的选择。
      if (kind === "provider") this.db.prepare("DELETE FROM configuration_items WHERE kind = 'model' AND json_extract(data_json, '$.providerId') = ?").run(id);
      this.db.prepare("DELETE FROM configuration_items WHERE kind = ? AND id = ?").run(kind, id);
    });
    return old;
  }
  transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
