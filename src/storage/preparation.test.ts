import { afterEach, describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { jsonStorage, sqliteStorage } from "./migrations.ts";
import { prepareData, readMigrationReport, recoverData } from "./preparation.ts";
import { readJson, writeJson } from "./files.ts";

const roots: string[] = [];
function root() { const value = mkdtempSync(join(tmpdir(), "atelier-migration-")); roots.push(value); return value; }
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
function document(directory: string, name: string, migrations: Record<number, (value: unknown) => unknown>, version = 3) {
  return jsonStorage({ id: name, file: join(directory, name), version, initial: () => ({ version, entries: [] }), migrations,
    validate(raw) {
      const value = raw as { version: number; entries: string[] };
      if (value.version !== version || !Array.isArray(value.entries) || value.entries.some(item => typeof item !== "string")) throw new Error("Invalid entries document.");
      return value;
    } });
}
const first = (raw: unknown) => ({ version: 2, entries: [(raw as { text: string }).text] });
const second = (raw: unknown) => ({ ...(raw as object), version: 3 });

describe("窗口前数据准备", () => {
  // 跨版本安装必须保留旧值，并在转换前保存数据库之外的完整内容与凭据。
  it("按顺序升级多个版本，备份原配置、附件与凭据", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "kept" });
    mkdirSync(join(directory, "content", "sealed"), { recursive: true });
    writeFileSync(join(directory, "content", "sealed", "attachment"), "original bytes");
    mkdirSync(join(directory, "credentials"));
    writeFileSync(join(directory, "credentials", "key.enc"), "encrypted bytes");
    const result = await prepareData(directory, { version: "1.0.0", stores: [document(directory, "configuration.json", { 1: first, 2: second })] });
    expect(result.ok).toBe(true);
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 3, entries: ["kept"] });
    const saved = join(result.report!.backup!, "files");
    expect(readJson(join(saved, "configuration.json"))).toEqual({ version: 1, text: "kept" });
    expect(readFileSync(join(saved, "content", "sealed", "attachment"), "utf8")).toBe("original bytes");
    expect(readFileSync(join(saved, "credentials", "key.enc"), "utf8")).toBe("encrypted bytes");
    expect(result.report!.changes).toEqual([{ id: "configuration.json", from: 1, to: 3 }]);
  });

  // 路径断裂与降级都不能通过默认值覆盖原配置，亦不能先执行已知的一部分步骤。
  it.each([1, 9])("格式 %i 无完整向前路径时保持原文件", async version => {
    const directory = root(), original = { version, text: "keep me" };
    writeJson(join(directory, "configuration.json"), original);
    let invoked = false;
    const result = await prepareData(directory, { version: "1.0.0", stores: [document(directory, "configuration.json", { 1: raw => { invoked = true; return first(raw); } })] });
    expect(result.ok).toBe(false);
    expect(invoked).toBe(false);
    expect(readJson(join(directory, "configuration.json"))).toEqual(original);
    expect(result.report!.backupComplete).toBe(false);
  });

  // 备份空间或路径不可写时，迁移函数尚未获得改写原文件的机会。
  it("备份失败时不执行转换", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "kept" });
    mkdirSync(join(directory, "recovery"));
    writeFileSync(join(directory, "recovery", "backups"), "blocked");
    let invoked = false;
    const result = await prepareData(directory, { version: "1", stores: [document(directory, "configuration.json", { 1: raw => { invoked = true; return first(raw); }, 2: second })] });
    expect(result.ok).toBe(false);
    expect(invoked).toBe(false);
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 1, text: "kept" });
  });

  // JSON 转换的末步失败时，前面内存中的变更不应落盘。
  it("JSON 迁移中途失败保持原文件", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "kept" });
    const result = await prepareData(directory, { version: "1", stores: [document(directory, "configuration.json", { 1: first, 2: () => { throw new Error("Conversion failed."); } })] });
    expect(result.ok).toBe(false);
    expect(result.report!.backupComplete).toBe(true);
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 1, text: "kept" });
  });

  // SQL 的前一步可能已经删改行；后一步失败必须将数据与格式号一并回滚。
  it("SQLite 迁移链在一个事务中回滚", async () => {
    const directory = root(); mkdirSync(join(directory, "db"));
    const file = join(directory, "db", "workspace.sqlite");
    const original = new DatabaseSync(file);
    original.exec("CREATE TABLE notes (text TEXT); INSERT INTO notes VALUES ('kept'); PRAGMA user_version = 1;"); original.close();
    const store = sqliteStorage({ id: "workspace", file, version: 3, initialize() {}, migrations: {
      1: db => db.exec("UPDATE notes SET text = 'changed';"),
      2: () => { throw new Error("Conversion failed."); },
    } });
    const result = await prepareData(directory, { version: "1", stores: [store] });
    expect(result.ok).toBe(false);
    const actual = new DatabaseSync(file);
    try {
      expect(actual.prepare("SELECT text FROM notes").get()).toMatchObject({ text: "kept" });
      expect(actual.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 1 });
    } finally { actual.close(); }
  });

  // 上次退出可能留下已提交但未 checkpoint 的 WAL；只备份主文件会漏掉这些用户记录。
  it("冷备份和还原保留 WAL 中的已提交数据", async () => {
    const directory = root(); mkdirSync(join(directory, "db"));
    const seed = join(directory, "seed.sqlite"), file = join(directory, "db", "workspace.sqlite");
    const database = new DatabaseSync(seed);
    try {
      database.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; CREATE TABLE notes (text TEXT); INSERT INTO notes VALUES ('in WAL'); PRAGMA user_version = 1;");
      for (const suffix of ["", "-wal", "-shm"]) if (existsSync(seed + suffix)) copyFileSync(seed + suffix, file + suffix);
    } finally { database.close(); }
    const stores = [sqliteStorage({ id: "workspace", file, version: 2, initialize() {}, migrations: {
      1: db => db.exec("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;"),
    } })];
    expect((await prepareData(directory, { version: "1", stores })).ok).toBe(true);
    recoverData(directory, "restore");
    const restored = new DatabaseSync(file);
    try {
      expect(restored.prepare("SELECT text FROM notes").get()).toMatchObject({ text: "in WAL" });
      expect(restored.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 1 });
    } finally { restored.close(); }
  });

  // 多个文件没有跨文件事务；重新进入时依据已提交格式续接，不能重复变换前一个文件。
  it.each(["migrating", "failed"] as const)("跨文件 %s 后只执行剩余迁移，并保留首次备份", async status => {
    const directory = root();
    for (const name of ["configuration.json", "plugins.json"]) writeJson(join(directory, name), { version: 1, text: name });
    let fail = true, converted = 0;
    const stores = [document(directory, "configuration.json", { 1: raw => { converted++; return first(raw); }, 2: second }),
      document(directory, "plugins.json", { 1: raw => { if (fail) throw new Error("Interrupted."); return first(raw); }, 2: second })];
    const failed = await prepareData(directory, { version: "1", stores });
    const report = failed.report!;
    // 持久状态为 migrating 表示进程在完成回执前退出；不依赖实际进程或时序。
    writeJson(join(directory, "recovery", "state.json"), { ...report, status });
    fail = false;
    const result = await prepareData(directory, { version: "1", stores, retry: status === "failed" });
    expect(result.ok).toBe(true); expect(converted).toBe(1);
    expect(result.report!.backup).toBe(report.backup);
    expect(readJson(join(directory, "plugins.json"))).toEqual({ version: 3, entries: ["plugins.json"] });
  });

  // 全部格式已升级但最终引用校验失败时，修复后重试必须写回成功，避免重启仍停在 failed。
  it("迁移已提交后的校验修复能结束失败状态", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "kept" });
    const stores = [document(directory, "configuration.json", { 1: first, 2: second })];
    const failed = await prepareData(directory, { version: "1", stores, validate() { throw new Error("Missing attachment."); } });
    const retried = await prepareData(directory, { version: "1", stores, retry: true });
    expect(retried.ok).toBe(true);
    expect(retried.report!.backup).toBe(failed.report!.backup);
    expect(readMigrationReport(directory)!.status).toBe("succeeded");
    expect((await prepareData(directory, { version: "1", stores })).ok).toBe(true);
  });

  // 还原已移走当前文件后可能复制失败；重试必须先恢复，不能把缺少文件视作新安装。
  it("还原再次失败仍保留恢复阶段，修复备份后继续还原", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "original" });
    const stores = [document(directory, "configuration.json", { 1: first, 2: second })];
    const migrated = await prepareData(directory, { version: "1", stores });
    const report = migrated.report!;
    const archive = join(directory, "recovery", "displaced", "fixture");
    mkdirSync(archive, { recursive: true });
    renameSync(join(directory, "configuration.json"), join(archive, "configuration.json"));
    writeJson(join(directory, "recovery", "state.json"), { ...report, status: "restoring", operation: { archive, originals: ["configuration.json"] } });
    const saved = join(report.backup!, "files", "configuration.json");
    const original = readFileSync(saved);
    rmSync(saved);
    expect((await prepareData(directory, { version: "1", stores })).ok).toBe(false);
    expect(readMigrationReport(directory)!.status).toBe("restoring");
    expect(existsSync(join(directory, "configuration.json"))).toBe(false);
    writeFileSync(saved, original);
    const restored = await prepareData(directory, { version: "1", stores, retry: true });
    expect(restored.ok).toBe(false);
    expect(restored.report!.status).toBe("restored");
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 1, text: "original" });
    expect(readJson(join(archive, "configuration.json"))).toEqual({ version: 3, entries: ["original"] });
  });

  // 还原必须替换整套数据，也必须保留部分升级后的现场，随后暂停自动重试。
  it("还原备份保留失败现场并暂停自动迁移", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "old" });
    const stores = [document(directory, "configuration.json", { 1: first, 2: second })];
    await prepareData(directory, { version: "1", stores, validate() { throw new Error("Reference failure."); } });
    recoverData(directory, "restore");
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 1, text: "old" });
    const report = readMigrationReport(directory)!;
    expect(readJson(join(report.operation!.archive, "configuration.json"))).toEqual({ version: 3, entries: ["old"] });
    const paused = await prepareData(directory, { version: "1", stores });
    expect(paused.ok).toBe(false); expect(paused.report!.status).toBe("restored");
    const retried = await prepareData(directory, { version: "1", stores, retry: true });
    expect(retried.ok).toBe(true);
    expect(retried.report!.backup).not.toBe(report.backup);
    expect(existsSync(report.backup!)).toBe(true);
  });

  // 备份被移动或删去一部分时，恢复操作必须在移动当前数据前失败。
  it("备份缺失时拒绝还原而保留当前文件", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "old" });
    const result = await prepareData(directory, { version: "1", stores: [document(directory, "configuration.json", { 1: first, 2: second })] });
    rmSync(join(result.report!.backup!, "files", "configuration.json"));
    expect(() => recoverData(directory, "restore")).toThrow("incomplete");
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 3, entries: ["old"] });
  });

  // 用户选择新数据时旧配置必须仍可找回；新库的建立不算格式迁移。
  it("重新开始先归档旧文件，再按新用户初始化", async () => {
    const directory = root();
    writeFileSync(join(directory, "configuration.json"), "broken JSON");
    const stores = [document(directory, "configuration.json", {})];
    await prepareData(directory, { version: "1", stores });
    recoverData(directory, "fresh");
    const archived = readMigrationReport(directory)!.operation!.archive;
    const result = await prepareData(directory, { version: "1", stores });
    expect(result).toEqual({ ok: true, report: null });
    expect(readFileSync(join(archived, "configuration.json"), "utf8")).toBe("broken JSON");
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 3, entries: [] });
  });

  // 新安装和无变更重启没有迁移，不应生成通知、备份或迁移日志。
  it("没有迁移时不产生记录", async () => {
    const directory = root();
    const options = { version: "1", stores: [document(directory, "configuration.json", {})] };
    expect(await prepareData(directory, options)).toEqual({ ok: true, report: null });
    expect(await prepareData(directory, options)).toEqual({ ok: true, report: null });
    expect(existsSync(join(directory, "recovery"))).toBe(false);
  });
});
