import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sessionSchemaSql } from "../session/schema.ts";
import { applicationBrand, applicationStorage } from "../shared/application.ts";
import { contentSchemaSql } from "./content-store.ts";

const workspaceDatabaseVersion = 20;

/** 开发期库格式不符：发布前不迁移，提示开发者删除 db 目录重建。 */
export class DatabaseVersionError extends Error {
  constructor(readonly directory: string, found: number) {
    super(`Workspace database format ${found} does not match this build (${workspaceDatabaseVersion}). Delete ${directory} and restart to recreate development data.`);
  }
}

export function openDatabase(root: string): DatabaseSync {
  mkdirSync(join(root, applicationStorage.databaseDirectory), { recursive: true });
  const db = new DatabaseSync(join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile));
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    // 发布前只有当前结构；版本不符直接报错，开发数据由使用者删除重建。
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (version === 0) db.exec(`BEGIN IMMEDIATE;
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
        id TEXT PRIMARY KEY, command_json TEXT NOT NULL,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
      ) STRICT;
      -- 当前会话数据；空 object_id 表示会话作用域，具型契约与时间线独立。
      CREATE TABLE session_data (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        object_id TEXT NOT NULL, contract_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY(session_id, object_id, contract_id)
      ) STRICT;
      ${contentSchemaSql}
      PRAGMA user_version = ${workspaceDatabaseVersion};
      COMMIT;`);
    else if (version !== workspaceDatabaseVersion) throw new DatabaseVersionError(join(root, applicationStorage.databaseDirectory), version);
    if (!db.prepare("SELECT id FROM workspace LIMIT 1").get()) {
      db.prepare("INSERT INTO workspace VALUES (?, ?)").run(randomUUID(), "Personal workspace");
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** 不可变内容先落盘再引用；失败留下的无引用 blob 不影响事件，后续可回收。 */
export class ObjectStore {
  constructor(private readonly root: string) { mkdirSync(root, { recursive: true }); }
  put(content: string): string {
    const hash = createHash("sha256").update(content).digest("hex");
    const target = join(this.root, hash);
    const temp = join(this.root, `.${randomUUID()}.tmp`);
    try {
      writeFileSync(temp, content, { encoding: "utf8", flag: "wx", mode: 0o600, flush: true });
      renameSync(temp, target);
    } finally {
      rmSync(temp, { force: true });
    }
    return hash;
  }
  get(ref: string): string | null {
    if (!/^[a-f0-9]{64}$/.test(ref)) throw new Error("Invalid object reference.");
    try {
      const content = readFileSync(join(this.root, ref), "utf8");
      if (createHash("sha256").update(content).digest("hex") !== ref) return null;
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
