import type { DatabaseSync } from "node:sqlite";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";

/** 会话当前数据；空对象作用域表示会话本身。与历史事件独立保存。 */
export class SessionDataStore {
  constructor(private readonly db: DatabaseSync) {}
  get(sessionId: string, objectId: string | null, key: string, version = 1): Json | null {
    const row = this.db.prepare("SELECT version, data_json FROM session_data WHERE session_id = ? AND object_id = ? AND contract_id = ?")
      .get(sessionId, objectId ?? "", key) as { version: number; data_json: string } | undefined;
    if (!row) return null;
    if (row.version !== version) throw new Error("The session data contract version is unavailable.");
    return jsonSchema.parse(JSON.parse(row.data_json));
  }
  set(sessionId: string, objectId: string | null, key: string, value: Json, version = 1): void {
    this.db.prepare(`INSERT INTO session_data (session_id, object_id, contract_id, version, data_json) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, object_id, contract_id) DO UPDATE SET version = excluded.version, data_json = excluded.data_json`)
      .run(sessionId, objectId ?? "", key, version, JSON.stringify(value));
  }
}
