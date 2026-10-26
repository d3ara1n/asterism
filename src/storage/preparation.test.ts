import { afterEach, describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { jsonStorage, sqliteStorage, type StorageDefinition } from "./migrations.ts";
import { clearPause, listRecoveryPoints, prepareData, recoveryPointDirectory, restorePoint, startFresh, type DataPath } from "./preparation.ts";
import { readJson, writeJson } from "./files.ts";

const roots: string[] = [];
function root() { const value = mkdtempSync(join(tmpdir(), "atelier-migration-")); roots.push(value); return value; }
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });

const paths: DataPath[] = [{ path: "configuration.json" }, { path: "db" }, { path: "extensions" }, { path: join("content", "sealed"), link: true }];
const document = (directory: string, version: number, migrations: Record<number, (value: unknown) => unknown>) =>
  jsonStorage({ id: "configuration", file: join(directory, "configuration.json"), version, migrations });
const toV2 = (raw: unknown) => ({ entries: [(raw as { text: string }).text] });
const toV3 = (raw: unknown) => ({ ...(raw as object), pinned: false });
const prepare = (directory: string, stores: StorageDefinition[], discover?: Parameters<typeof prepareData>[1]["discover"]) =>
  prepareData(directory, { version: "1.0.0", paths, stores, discover });
const pointFile = (directory: string, id: string, ...parts: string[]) => join(recoveryPointDirectory(directory, id), "files", ...parts);

describe("数据准备", () => {
  // 跨多个版本升级时必须保留原值，并在改写前把整组数据（含附件）存入恢复点。
  it("逐步升级多个版本，迁移前的数据进入恢复点", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "kept" });
    mkdirSync(join(directory, "content", "sealed"), { recursive: true });
    writeFileSync(join(directory, "content", "sealed", "attachment"), "original bytes");
    const result = await prepare(directory, [document(directory, 3, { 1: toV2, 2: toV3 })]);
    expect(result).toEqual({ ok: true, plugins: [] });
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 3, entries: ["kept"], pinned: false });
    const [point] = listRecoveryPoints(directory);
    expect(point).toMatchObject({ kind: "migration", notice: true, changes: [{ id: "configuration", from: 1, to: 3 }] });
    expect(readJson(pointFile(directory, point!.id, "configuration.json"))).toEqual({ version: 1, text: "kept" });
    // 封存内容一次写入，恢复点与工作目录共享同一份字节。
    const saved = pointFile(directory, point!.id, "content", "sealed", "attachment");
    expect(readFileSync(saved, "utf8")).toBe("original bytes");
    expect(statSync(saved).ino).toBe(statSync(join(directory, "content", "sealed", "attachment")).ino);
  });

  // 版本过新、迁移路径断裂或缺少版本号都不能改写原文件，也不应先执行已知的部分步骤。
  it.each([
    ["版本过新", { version: 9, text: "keep" }],
    ["路径缺失", { version: 0, text: "keep" }],
    ["没有版本号", { text: "keep" }],
  ])("%s时失败并保持原文件", async (_name, original) => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), original);
    let invoked = false;
    const result = await prepare(directory, [document(directory, 3, { 1: raw => { invoked = true; return toV2(raw); }, 2: toV3 })]);
    expect(result.ok).toBe(false);
    expect(invoked).toBe(false);
    expect(readJson(join(directory, "configuration.json"))).toEqual(original);
    expect(existsSync(join(directory, "recovery"))).toBe(false);
  });

  // 末步失败时前面内存中的转换不能落盘；同一组变化重试时沿用原恢复点，不让反复失败挤掉更早的恢复点。
  it("JSON 迁移中途失败保持原文件，重试沿用同一恢复点", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "kept" });
    let fail = true;
    const stores = [document(directory, 3, { 1: toV2, 2: raw => { if (fail) throw new Error("Conversion failed."); return toV3(raw); } })];
    expect((await prepare(directory, stores)).ok).toBe(false);
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 1, text: "kept" });
    expect((await prepare(directory, stores)).ok).toBe(false);
    fail = false;
    expect((await prepare(directory, stores)).ok).toBe(true);
    expect(listRecoveryPoints(directory)).toHaveLength(1);
  });

  // SQL 前一步可能已删改结构；后一步失败必须将结构与格式号一并回滚。
  it("SQLite 迁移链在一个事务中回滚", async () => {
    const directory = root(); mkdirSync(join(directory, "db"));
    const file = join(directory, "db", "workspace.sqlite");
    const seed = new DatabaseSync(file);
    try { seed.exec("CREATE TABLE notes (text TEXT); INSERT INTO notes VALUES ('kept'); PRAGMA user_version = 1;"); } finally { seed.close(); }
    const stores = [sqliteStorage({ id: "workspace", file, version: 3, migrations: {
      1: db => db.exec("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;"),
      2: () => { throw new Error("Conversion failed."); },
    } })];
    expect((await prepare(directory, stores)).ok).toBe(false);
    const db = new DatabaseSync(file);
    try {
      expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 1 });
      expect(db.prepare("SELECT * FROM notes").get()).toEqual({ text: "kept" });
    } finally { db.close(); }
  });

  // 上次退出可能留下未 checkpoint 的 WAL；只复制主文件会漏掉已提交的记录。
  it("恢复点保留 WAL 中已提交的数据库记录", async () => {
    const directory = root(); mkdirSync(join(directory, "db"));
    const seed = join(directory, "seed.sqlite"), file = join(directory, "db", "workspace.sqlite");
    const database = new DatabaseSync(seed);
    try {
      database.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; CREATE TABLE notes (text TEXT); INSERT INTO notes VALUES ('in WAL'); PRAGMA user_version = 1;");
      for (const suffix of ["", "-wal", "-shm"]) if (existsSync(seed + suffix)) copyFileSync(seed + suffix, file + suffix);
    } finally { database.close(); }
    const stores = [sqliteStorage({ id: "workspace", file, version: 2, migrations: { 1: db => db.exec("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;") } })];
    expect((await prepare(directory, stores)).ok).toBe(true);
    const saved = new DatabaseSync(pointFile(directory, listRecoveryPoints(directory)[0]!.id, "db", "workspace.sqlite"));
    try {
      expect(saved.prepare("SELECT * FROM notes").get()).toEqual({ text: "in WAL" });
      expect(saved.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 1 });
    } finally { saved.close(); }
  });

  // 保留策略：只留最近 7 个完整恢复点，最新的恢复点不能被清理。
  it("只保留最近 7 个恢复点", async () => {
    const directory = root();
    for (let version = 1; version <= 9; version++) {
      writeJson(join(directory, "configuration.json"), { version, text: String(version) });
      expect((await prepare(directory, [document(directory, version + 1, { [version]: raw => raw })])).ok).toBe(true);
    }
    const points = listRecoveryPoints(directory);
    expect(points).toHaveLength(7);
    expect(points[0]!.changes).toEqual([{ id: "configuration", from: 9, to: 10 }]);
    expect(readdirSync(join(directory, "recovery", "points"))).toHaveLength(7);
  });

  // 还原替换整组数据并保留当前现场；重启后暂停自动迁移，避免同一错误循环，直到用户重试。
  it("还原恢复点保留当前数据并暂停自动迁移", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "old" });
    const stores = [document(directory, 3, { 1: toV2, 2: toV3 })];
    await prepare(directory, stores);
    const target = listRecoveryPoints(directory)[0]!.id;
    restorePoint(directory, paths, target, "1.0.0");
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 1, text: "old" });
    const displaced = listRecoveryPoints(directory).find(point => point.kind === "before-restore")!;
    expect(readJson(pointFile(directory, displaced.id, "configuration.json"))).toEqual({ version: 3, entries: ["old"], pinned: false });
    expect(await prepare(directory, stores)).toMatchObject({ ok: false, paused: true });
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 1, text: "old" });
    clearPause(directory);
    expect((await prepare(directory, stores)).ok).toBe(true);
    expect(listRecoveryPoints(directory).filter(point => point.kind === "migration")).toHaveLength(2);
  });

  // 还原进程可能在移动现场之前或复制途中退出；下一次准备必须先按持久状态完成还原。
  it("中断的还原在下一次准备时继续", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "old" });
    const stores = [document(directory, 2, { 1: toV2 })];
    await prepare(directory, stores);
    const target = listRecoveryPoints(directory)[0]!.id;
    writeJson(join(directory, "recovery", "state.json"), { phase: "restoring", target, displaced: "9999-interrupted" });
    expect(await prepare(directory, stores)).toMatchObject({ ok: false, paused: true });
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 1, text: "old" });
    expect(readJson(pointFile(directory, "9999-interrupted", "configuration.json"))).toEqual({ version: 2, entries: ["old"] });
  });

  // 重新开始必须让旧数据可找回，随后由业务层按新用户创建，不算格式迁移。
  it("重新开始把当前数据移入恢复点", async () => {
    const directory = root();
    writeFileSync(join(directory, "configuration.json"), "broken JSON");
    const stores = [document(directory, 2, {})];
    expect((await prepare(directory, stores)).ok).toBe(false);
    startFresh(directory, paths, "1.0.0");
    expect(existsSync(join(directory, "configuration.json"))).toBe(false);
    const [point] = listRecoveryPoints(directory);
    expect(point!.kind).toBe("before-fresh");
    expect(readFileSync(pointFile(directory, point!.id, "configuration.json"), "utf8")).toBe("broken JSON");
    expect(await prepare(directory, stores)).toEqual({ ok: true, plugins: [] });
  });

  // 插件迁移失败只禁用该插件：宿主照常升级，插件文件保持原样，不进入恢复页。
  it("插件存储失败只报告该插件", async () => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), { version: 1, text: "host" });
    const plugin = join(directory, "extensions", "acme.notes", "notes.json");
    writeJson(plugin, { version: 1, data: { text: "plugin" } });
    const failing = jsonStorage({ id: "acme.notes/notes.json", file: plugin, version: 2, envelope: true,
      migrations: { 1: () => { throw new Error("Plugin conversion failed."); } } });
    const result = await prepare(directory, [document(directory, 2, { 1: toV2 })], async () => [
      { id: "acme.notes", stores: [failing] },
      { id: "acme.broken", stores: [], error: "Build failed." },
    ]);
    expect(result).toEqual({ ok: true, plugins: [{ id: "acme.notes", error: "Plugin conversion failed." }, { id: "acme.broken", error: "Build failed." }] });
    expect(readJson(join(directory, "configuration.json"))).toEqual({ version: 2, entries: ["host"] });
    expect(readJson(plugin)).toEqual({ version: 1, data: { text: "plugin" } });
    expect(listRecoveryPoints(directory)[0]!.notice).toBe(false);
  });

  // 新安装和无变化重启只读版本号，不产生恢复点或提示。
  it("没有迁移时不产生恢复点", async () => {
    const directory = root();
    const stores = [document(directory, 2, {})];
    expect(await prepare(directory, stores)).toEqual({ ok: true, plugins: [] });
    writeJson(join(directory, "configuration.json"), { version: 2, entries: [] });
    expect(await prepare(directory, stores)).toEqual({ ok: true, plugins: [] });
    expect(existsSync(join(directory, "recovery"))).toBe(false);
  });
});
