import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readJson, writeJson } from "./files.ts";

export interface StorageChange { id: string; from: number; to: number }
export interface PreparedStorage {
  id: string;
  file: string;
  change?: StorageChange;
  apply(): void;
  validate(): void;
}
export interface StorageDefinition { id: string; inspect(): PreparedStorage }

/** 每个键代表 v → v+1；先检查整条链，再执行任何转换。 */
export function migrationPath<T>(id: string, from: number, to: number, steps: Readonly<Record<number, T>>): T[] {
  if (!Number.isSafeInteger(to) || to < 0) throw new Error(`Invalid target version for ${id}.`);
  if (!Number.isSafeInteger(from) || from < 0) throw new Error(`Invalid data version for ${id}.`);
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
  initial(): unknown;
  migrations: Readonly<Record<number, (value: unknown) => unknown>>;
  validate(value: unknown): unknown;
  /** 平铺宿主文档使用 version 字段；插件文档使用 {version,data} 信封。 */
  envelope?: boolean;
  unversioned?: boolean;
}
export function jsonStorage(options: JsonStorageOptions): StorageDefinition {
  const { id, file, version, envelope } = options;
  const decode = (raw: unknown): { version: number; data: unknown } => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid document for ${id}.`);
    const record = raw as Record<string, unknown>;
    if (record.version === undefined && options.unversioned) return { version: 0, data: raw };
    if (!Number.isSafeInteger(record.version)) throw new Error(`Invalid data version for ${id}.`);
    return { version: record.version as number, data: envelope ? record.data : raw };
  };
  const encode = (value: unknown) => envelope ? { version, data: value } : { ...(value as object), version };
  return { id, inspect() {
    const raw = readJson(file);
    const found = raw === undefined ? null : decode(raw);
    const steps = found ? migrationPath(id, found.version, version, options.migrations) : [];
    // 迁移函数在备份之后执行；预检只验证无需转换的文档。
    let value = found ? found.data : options.initial();
    if (!steps.length) options.validate(value);
    return { id, file,
      ...(found && found.version !== version ? { change: { id, from: found.version, to: version } } : {}),
      apply() {
        if (found && !steps.length) return;
        for (const step of steps) value = step(structuredClone(value));
        options.validate(value);
        writeJson(file, encode(value));
      },
      validate() {
        const document = decode(readJson(file));
        if (document.version !== version) throw new Error(`Data for ${id} was not upgraded to ${version}.`);
        options.validate(document.data);
      },
    };
  } };
}

export interface SqliteStorageOptions {
  id: string; file: string; version: number;
  initialize(db: DatabaseSync): void;
  migrations: Readonly<Record<number, (db: DatabaseSync) => void>>;
  validate?(db: DatabaseSync): void;
}
function databaseVersion(db: DatabaseSync): number { return Number(db.prepare("PRAGMA user_version").get()!.user_version); }
function validateDatabase(db: DatabaseSync, validate?: (db: DatabaseSync) => void): void {
  if (db.prepare("PRAGMA quick_check").all().some(row => row.quick_check !== "ok")) throw new Error("Database integrity check failed.");
  if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Database foreign key check failed.");
  validate?.(db);
}
export function sqliteStorage(options: SqliteStorageOptions): StorageDefinition {
  const { id, file, version } = options;
  return { id, inspect() {
    let found: number | null = null;
    if (existsSync(file)) {
      const db = new DatabaseSync(file, { readOnly: true });
      try { found = databaseVersion(db); validateDatabase(db); } finally { db.close(); }
    }
    const steps = found === null ? [] : migrationPath(id, found, version, options.migrations);
    return { id, file,
      ...(found !== null && found !== version ? { change: { id, from: found, to: version } } : {}),
      apply() {
        if (found === version) return;
        mkdirSync(dirname(file), { recursive: true });
        const db = new DatabaseSync(file);
        try {
          db.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
          if (found === null) options.initialize(db);
          else for (const step of steps) step(db);
          validateDatabase(db, options.validate);
          db.exec(`PRAGMA user_version = ${version}; COMMIT;`);
        } catch (error) { if (db.isTransaction) db.exec("ROLLBACK;"); throw error; }
        finally { db.close(); }
      },
      validate() {
        const db = new DatabaseSync(file, { readOnly: true });
        try {
          if (databaseVersion(db) !== version) throw new Error(`Data for ${id} was not upgraded to ${version}.`);
          validateDatabase(db, options.validate);
        } finally { db.close(); }
      },
    };
  } };
}
