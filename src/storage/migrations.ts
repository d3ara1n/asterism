import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { readJson, writeJson } from "./files.ts";

export interface StorageChange { id: string; from: number; to: number }
/** 一份已存在且版本落后的文件；`apply` 执行整条迁移链并提交新版本。 */
export interface StoragePlan { change: StorageChange; apply(): void }
/** 只读取版本号：文件不存在或已是当前版本时没有计划，由业务层按当前格式创建或读取。 */
export interface StorageDefinition { id: string; file: string; inspect(): StoragePlan | null }

/** 每个键代表 v → v+1；先检查整条链，再执行任何转换。 */
export function migrationPath<T>(id: string, from: number, to: number, steps: Readonly<Record<number, T>>): T[] {
  if (from > to) throw new Error(`Data for ${id} uses version ${from}; this application supports ${to}. Install a newer application.`);
  const path: T[] = [];
  for (let version = from; version < to; version++) {
    if (!Object.hasOwn(steps, version)) throw new Error(`Missing migration for ${id}: ${version} → ${version + 1}.`);
    path.push(steps[version]!);
  }
  return path;
}

export interface JsonStorageOptions {
  id: string; file: string; version: number;
  migrations: Readonly<Record<number, (value: unknown) => unknown>>;
  /** 平铺宿主文档的 `version` 与正文同层；插件文档使用 `{ version, data }` 信封。 */
  envelope?: boolean;
}
export function jsonStorage({ id, file, version, migrations, envelope }: JsonStorageOptions): StorageDefinition {
  return { id, file, inspect() {
    const raw = readJson(file);
    if (raw === undefined) return null;
    const found = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).version : undefined;
    if (!Number.isSafeInteger(found)) throw new Error(`Data for ${id} has no format version.`);
    if (found === version) return null;
    const steps = migrationPath(id, found as number, version, migrations);
    return { change: { id, from: found as number, to: version }, apply() {
      let value = envelope ? (raw as { data?: unknown }).data : raw;
      for (const step of steps) value = step(value);
      // 平铺文档的迁移步骤产生下一版正文；最终版本号由适配器统一写入。
      writeJson(file, envelope ? { version, data: value } : { ...(value as object), version });
    } };
  } };
}

export interface SqliteStorageOptions {
  id: string; file: string; version: number;
  migrations: Readonly<Record<number, (db: DatabaseSync) => void>>;
}
/** `user_version` 为 0 表示尚未由业务层建立；SQL 步骤使用传入连接，事务与版本号由适配器提交。 */
export function sqliteStorage({ id, file, version, migrations }: SqliteStorageOptions): StorageDefinition {
  return { id, file, inspect() {
    if (!existsSync(file)) return null;
    const db = new DatabaseSync(file);
    let found: number;
    try { found = Number(db.prepare("PRAGMA user_version").get()!.user_version); }
    finally { db.close(); }
    if (found === 0 || found === version) return null;
    const steps = migrationPath(id, found, version, migrations);
    return { change: { id, from: found, to: version }, apply() {
      const db = new DatabaseSync(file);
      try {
        db.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
        for (const step of steps) step(db);
        db.exec(`PRAGMA user_version = ${version}; COMMIT;`);
      } catch (error) { if (db.isTransaction) db.exec("ROLLBACK;"); throw error; }
      finally { db.close(); }
    } };
  } };
}
