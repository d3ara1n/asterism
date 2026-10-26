import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sessionSchemaSql } from "../session/schema.ts";
import { applicationStorage, sessionRetentionMs } from "../shared/application.ts";
import { contentSchemaSql } from "./content-store.ts";
import { templateSchemaSql } from "./templates.ts";
import { sqliteStorage } from "../storage/migrations.ts";

export const workspaceDatabaseVersion = 25;

/** 业务开库只消费已准备好的格式；升级由窗口前的数据准备执行。 */
export class DatabaseVersionError extends Error {
  constructor(readonly directory: string, found: number) {
    super(`Workspace database format ${found} does not match this build (${workspaceDatabaseVersion}). Prepare the data before opening the workspace.`);
  }
}

export function openDatabase(root: string): DatabaseSync {
  mkdirSync(join(root, applicationStorage.databaseDirectory), { recursive: true });
  const db = new DatabaseSync(join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile));
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    // 独立服务测试可创建新库；已有库升级由统一数据准备完成。
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (version === 0 && !db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").get()) {
      db.exec("BEGIN IMMEDIATE;");
      initializeWorkspace(db);
      db.exec(`PRAGMA user_version = ${workspaceDatabaseVersion}; COMMIT;`);
    }
    else if (version !== workspaceDatabaseVersion) throw new DatabaseVersionError(join(root, applicationStorage.databaseDirectory), version);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function initializeWorkspace(db: DatabaseSync): void {
  db.exec(`
      CREATE TABLE workspace (id TEXT PRIMARY KEY, title TEXT NOT NULL);
      ${sessionSchemaSql}
      CREATE TABLE object_views (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, object_id TEXT NOT NULL,
        x REAL NOT NULL, y REAL NOT NULL, hidden INTEGER NOT NULL DEFAULT 0,
        collapsed INTEGER NOT NULL DEFAULT 0,
        width REAL, height REAL,
        CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0 AND width IS NOT NULL AND height IS NOT NULL)),
        PRIMARY KEY(session_id, object_id)
      );
      CREATE TABLE viewports (session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, x REAL NOT NULL, y REAL NOT NULL, zoom REAL NOT NULL);
      -- 首页发送的会话级提交去重；代理内部的提交去重属于代理资源状态。
      CREATE TABLE session_submissions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
      ) STRICT;
      -- 当前会话数据；空 object_id 表示会话作用域，具型契约与时间线独立。
      CREATE TABLE session_data (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        object_id TEXT NOT NULL, contract_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY(session_id, object_id, contract_id)
      ) STRICT;
      ${templateSchemaSql}
      ${contentSchemaSql}`);
  db.prepare("INSERT INTO workspace VALUES (?, ?)").run(randomUUID(), "Personal workspace");
}

/** 已发布的每一步迁移固定保留；键 25 表示 25 → 26。 */
export const workspaceMigrations: Readonly<Record<number, (db: DatabaseSync) => void>> = {};
export function workspaceStorage(root: string) {
  return sqliteStorage({ id: "workspace", file: join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile),
    version: workspaceDatabaseVersion, initialize: initializeWorkspace, migrations: workspaceMigrations,
    validate(db) {
      for (const table of ["workspace", "sessions", "session_nodes", "cursor_selections", "session_data", "contents", "content_roots", "templates", "template_content_roots", "object_views", "viewports", "session_submissions"])
        db.prepare(`SELECT * FROM ${table} LIMIT 0`).all();
      if (!db.prepare("SELECT id FROM workspace LIMIT 1").get()) throw new Error("The workspace identity is missing.");
    } });
}
/** 启动清理：硬删超过冷静期的归档会话，关联行随外键级联删除；孤儿内容由随后构造的内容存储回收。 */
export function collectExpiredSessions(db: DatabaseSync, now = Date.now()): number {
  const cutoff = new Date(now - sessionRetentionMs).toISOString();
  return Number(db.prepare("DELETE FROM sessions WHERE archived_at IS NOT NULL AND archived_at <= ?").run(cutoff).changes);
}
