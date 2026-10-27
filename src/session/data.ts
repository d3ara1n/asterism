import type { DatabaseSync } from "node:sqlite";
import { jsonSchema, type Json } from "@asterism-app/sdk/contracts";

/** Current session data; an empty object scope denotes the session itself. Stored independently of historical events. */
export class SessionDataStore {
  constructor(private readonly db: DatabaseSync) {}
  entries(sessionId: string, objectId: string): { contract: string; data: Json }[] {
    const rows = this.db.prepare("SELECT contract_id, data_json FROM session_data WHERE session_id = ? AND object_id = ? ORDER BY contract_id")
      .all(sessionId, objectId) as { contract_id: string; data_json: string }[];
    return rows.map(row => ({ contract: row.contract_id, data: jsonSchema.parse(JSON.parse(row.data_json)) }));
  }
  get(sessionId: string, objectId: string | null, key: string): Json | undefined {
    const row = this.db.prepare("SELECT data_json FROM session_data WHERE session_id = ? AND object_id = ? AND contract_id = ?")
      .get(sessionId, objectId ?? "", key) as { data_json: string } | undefined;
    if (!row) return undefined;
    return jsonSchema.parse(JSON.parse(row.data_json));
  }
  set(sessionId: string, objectId: string | null, key: string, value: Json): void {
    this.db.prepare(`INSERT INTO session_data (session_id, object_id, contract_id, data_json) VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, object_id, contract_id) DO UPDATE SET data_json = excluded.data_json`)
      .run(sessionId, objectId ?? "", key, JSON.stringify(value));
  }
}
