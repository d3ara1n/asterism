import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(root: string): DatabaseSync {
  mkdirSync(join(root, "db"), { recursive: true });
  const db = new DatabaseSync(join(root, "db", "weft.sqlite"));
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    // 发布前只有当前结构；版本不符直接报错，开发数据由使用者删除重建。
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (version === 0) db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE workspace (id TEXT PRIMARY KEY, title TEXT NOT NULL);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, branch_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE object_views (
        task_id TEXT NOT NULL REFERENCES tasks(id), object_id TEXT NOT NULL,
        x REAL NOT NULL, y REAL NOT NULL, hidden INTEGER NOT NULL DEFAULT 0,
        collapsed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(task_id, object_id)
      );
      CREATE TABLE viewports (task_id TEXT PRIMARY KEY REFERENCES tasks(id), x REAL NOT NULL, y REAL NOT NULL, zoom REAL NOT NULL);
      CREATE TABLE configuration_items (
        kind TEXT NOT NULL CHECK (kind IN ('provider', 'model', 'role', 'agent')),
        id TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0),
        data_json TEXT NOT NULL, builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1)),
        credential_ref TEXT, PRIMARY KEY (kind, id)
      ) STRICT;
      CREATE TABLE configuration_state (id INTEGER PRIMARY KEY CHECK (id = 1)) STRICT;
      CREATE TABLE conversation_submissions (
        id TEXT PRIMARY KEY, command_json TEXT NOT NULL,
        task_id TEXT NOT NULL REFERENCES tasks(id), agent_id TEXT NOT NULL
      ) STRICT;
      CREATE TABLE conversation_selections (
        task_id TEXT NOT NULL REFERENCES tasks(id), agent_id TEXT NOT NULL,
        agent_configuration_id TEXT NOT NULL, model_id TEXT NOT NULL, thinking TEXT,
        revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(task_id, agent_id)
      ) STRICT;
      PRAGMA user_version = 1;
      COMMIT;`);
    else if (version !== 1) throw new Error("This workspace database format is not supported by this build of Weft.");
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
