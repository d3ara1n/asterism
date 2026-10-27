import { afterEach, describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { jsonStorage, sqliteStorage, type StorageDefinition } from "./migrations.ts";
import { clearPause, listRecoveryPoints, prepareData, recoveryPointDirectory, restorePoint, startFresh, type DataPath } from "./preparation.ts";
import { readJson, writeJson } from "./files.ts";

const roots: string[] = [];
function root() { const value = mkdtempSync(join(tmpdir(), "asterism-migration-")); roots.push(value); return value; }
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });

const paths: DataPath[] = [{ path: "configuration.json" }, { path: "db" }, { path: "extensions" }, { path: join("content", "sealed"), link: true }];
const document = (directory: string, version: number, migrations: Record<number, (value: unknown) => unknown>) =>
  jsonStorage({ id: "configuration", file: join(directory, "configuration.json"), version, migrations });
const toV2 = (raw: unknown) => ({ entries: [(raw as { text: string }).text] });
const toV3 = (raw: unknown) => ({ ...(raw as object), pinned: false });
const prepare = (directory: string, stores: StorageDefinition[], discover?: Parameters<typeof prepareData>[1]["discover"]) =>
  prepareData(directory, { version: "1.0.0", paths, stores, discover });
const pointFile = (directory: string, id: string, ...parts: string[]) => join(recoveryPointDirectory(directory, id), "files", ...parts);

describe("Data preparation", () => {
  // Multiversion upgrades retain original values and save the complete data set, including attachments, to recovery points before rewriting.
  it("upgrades multiple versions incrementally and places pre-migration data in recovery points", async () => {
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
    // Sealed content is written once; recovery points and working directories share the same bytes.
    const saved = pointFile(directory, point!.id, "content", "sealed", "attachment");
    expect(readFileSync(saved, "utf8")).toBe("original bytes");
    expect(statSync(saved).ino).toBe(statSync(join(directory, "content", "sealed", "attachment")).ino);
  });

  // Too-new versions, broken migration paths, and absent versions must neither rewrite originals nor run partial known steps first.
  it.each([
    ["version too new", { version: 9, text: "keep" }],
    ["missing migration path", { version: 0, text: "keep" }],
    ["missing version", { text: "keep" }],
  ])("fails for %s while preserving original files", async (_name, original) => {
    const directory = root();
    writeJson(join(directory, "configuration.json"), original);
    let invoked = false;
    const result = await prepare(directory, [document(directory, 3, { 1: raw => { invoked = true; return toV2(raw); }, 2: toV3 })]);
    expect(result.ok).toBe(false);
    expect(invoked).toBe(false);
    expect(readJson(join(directory, "configuration.json"))).toEqual(original);
    expect(existsSync(join(directory, "recovery"))).toBe(false);
  });

  // Final-step failure must not persist earlier in-memory conversions; retries of the same changes reuse recovery points so repeated failures do not evict older points.
  it("JSON migration failures preserve originals and retries reuse the same recovery point", async () => {
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

  // Earlier SQL steps may change or delete structure; later failures must roll back structure and format versions together.
  it("SQLite migration chains roll back in one transaction", async () => {
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

  // Previous exits may leave uncheckpointed WAL; copying only main files loses committed records.
  it("recovery points preserve committed database records in WAL", async () => {
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

  // Retention policy keeps only the latest 7 complete recovery points without deleting the newest.
  it("keeps only the latest 7 recovery points", async () => {
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

  // Restoration replaces the complete data set and preserves the current state; pause automatic migration after restart until user retry to prevent recurring errors.
  it("restoring recovery points preserves current data and pauses automatic migration", async () => {
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

  // Restoration may exit before moving current data or during copying; next preparation must complete restoration from persisted state first.
  it("interrupted restoration resumes on next preparation", async () => {
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

  // Starting over keeps old data recoverable, then business logic creates data for a new user; this is not format migration.
  it("starting over moves current data into recovery points", async () => {
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

  // Plugin migration failures disable only that plugin: hosts upgrade normally, plugin files stay unchanged, and recovery pages do not appear.
  it("plugin storage failures report only the affected plugin", async () => {
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

  // New installations and unchanged restarts read versions only without recovery points or prompts.
  it("no migration creates no recovery points", async () => {
    const directory = root();
    const stores = [document(directory, 2, {})];
    expect(await prepare(directory, stores)).toEqual({ ok: true, plugins: [] });
    writeJson(join(directory, "configuration.json"), { version: 2, entries: [] });
    expect(await prepare(directory, stores)).toEqual({ ok: true, plugins: [] });
    expect(existsSync(join(directory, "recovery"))).toBe(false);
  });
});
