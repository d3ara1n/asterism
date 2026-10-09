import type { DatabaseSync } from "node:sqlite";
import { jsonSchema, type Json } from "../shared/json.ts";

/** 资源私有数据：按对象 ID 与键保存，会话只负责级联清理，不解释内容。 */
export class ResourceStateStore {
  constructor(private readonly db: DatabaseSync) {}
  get(objectId: string, key: string): Json | null {
    const row = this.db.prepare("SELECT value_json FROM resource_states WHERE object_id = ? AND key = ?").get(objectId, key) as { value_json: string } | undefined;
    return row ? jsonSchema.parse(JSON.parse(row.value_json)) : null;
  }
  set(sessionId: string, objectId: string, key: string, value: Json): void {
    this.db.prepare(`INSERT INTO resource_states (session_id, object_id, key, value_json) VALUES (?, ?, ?, ?)
      ON CONFLICT(object_id, key) DO UPDATE SET value_json = excluded.value_json`).run(sessionId, objectId, key, JSON.stringify(value));
  }
}
