import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { migrationReportSchema, type DataPreparationResult, type MigrationReport } from "../shared/migrations.ts";
import { readJson, writeJson } from "./files.ts";
import type { PreparedStorage, StorageDefinition } from "./migrations.ts";
import { z } from "zod";
import { applicationStorage } from "../shared/application.ts";

/** 只包含应用持有的数据；插件源码、缓存、日志与恢复点自身独立保留。 */
export const dataPaths = ["db", "configuration.json", "plugins.json", "appearance.json", "language.json", "ui-state.json", "updates.json", "content", "credentials", "extensions"] as const;
const recoveryRoot = (root: string) => join(root, applicationStorage.recoveryDirectory);
const stateFile = (root: string) => join(recoveryRoot(root), "state.json");
export function readMigrationReport(root: string): MigrationReport | null {
  const raw = readJson(stateFile(root));
  return raw === undefined ? null : migrationReportSchema.parse(raw);
}
function save(root: string, report: MigrationReport): void {
  writeJson(stateFile(root), report);
  writeJson(join(recoveryRoot(root), "history", `${report.id}.json`), report);
}
export function acknowledgeMigration(root: string): void {
  const report = readMigrationReport(root);
  if (report?.status === "succeeded") save(root, { ...report, acknowledged: true });
}
function newReport(version: string): MigrationReport {
  return { version: 1, id: randomUUID(), status: "preparing", createdAt: new Date().toISOString(), applicationVersion: version,
    changes: [], backup: null, backupComplete: false, error: null, acknowledged: false };
}
function copy(source: string, destination: string): void {
  mkdirSync(join(destination, ".."), { recursive: true, mode: 0o700 });
  cpSync(source, destination, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
}

/** 窗口、业务进程与所有数据库连接启动前，整组文件冷备份包含 WAL/journal；备份完成前原文件保持不变。 */
function backup(root: string, report: MigrationReport): void {
  const directory = join(recoveryRoot(root), "backups", report.id);
  report.backup = directory;
  save(root, report);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const files = join(directory, "files");
  mkdirSync(files, { recursive: true, mode: 0o700 });
  for (const name of dataPaths) if (existsSync(join(root, name))) copy(join(root, name), join(files, name));
  writeJson(join(directory, "manifest.json"), { version: 1, id: report.id, createdAt: report.createdAt,
    applicationVersion: report.applicationVersion, changes: report.changes, paths: dataPaths.filter(name => existsSync(join(files, name))) });
  report.backupComplete = true;
  save(root, report);
}

/** 恢复前保留失败现场；每项移动与重复复制均可在下次启动继续。 */
export function recoverData(root: string, action: "restore" | "fresh"): void {
  const report = readMigrationReport(root);
  if (!report) throw new Error("There is no data recovery operation to perform.");
  if (action === "restore" && (!report.backupComplete || !report.backup)) throw new Error("A complete backup is unavailable.");
  if (action === "restore") {
    const manifest = z.object({ version: z.literal(1), paths: z.array(z.enum(dataPaths)) }).parse(readJson(join(report.backup!, "manifest.json")));
    for (const name of manifest.paths) if (!existsSync(join(report.backup!, "files", name)))
      throw new Error(`Backup is incomplete: ${name} is missing.`);
  }
  const status = action === "restore" ? "restoring" : "resetting";
  if (report.status !== status) {
    report.status = status;
    report.operation = { archive: join(recoveryRoot(root), "displaced", randomUUID()), originals: dataPaths.filter(name => existsSync(join(root, name))) };
    save(root, report);
  }
  const operation = report.operation!;
  mkdirSync(operation.archive, { recursive: true, mode: 0o700 });
  for (const name of dataPaths) {
    const current = join(root, name), archived = join(operation.archive, name);
    if (operation.originals.includes(name) && !existsSync(archived) && existsSync(current)) renameSync(current, archived);
    // 原现场已保存；重启后可覆盖上次未复制完整的恢复目标。
    rmSync(current, { recursive: true, force: true });
    if (action === "restore") {
      const source = join(report.backup!, "files", name);
      if (existsSync(source)) copy(source, current);
    }
  }
  report.status = action === "restore" ? "restored" : "reset";
  report.error = null;
  save(root, report);
}

export interface PreparationOptions {
  version: string;
  stores: readonly StorageDefinition[];
  /** 宿主插件目录准备后发现声明；发现阶段保持业务 setup 尚未执行。 */
  discover?: () => Promise<readonly StorageDefinition[]>;
  validate?: () => void;
  retry?: boolean;
}
export async function prepareData(root: string, options: PreparationOptions): Promise<DataPreparationResult> {
  let report: MigrationReport | null = null;
  try {
    report = readMigrationReport(root);
    if (report?.status === "restoring" || report?.status === "resetting") {
      const restoring = report.status === "restoring";
      recoverData(root, restoring ? "restore" : "fresh");
      report = readMigrationReport(root);
      if (restoring) return { ok: false, report: report! };
    }
    if (report && (report.status === "failed" || report.status === "restored") && !options.retry) return { ok: false, report };
    const continuing = report?.status === "migrating" || report?.status === "failed" && options.retry;
    // 中断的备份尚未允许任何写入，下次创建新备份；完成的备份用于同一链的续接。
    const previousSuccess = report?.status === "succeeded" ? report : null;
    if (!continuing) report = null;
    const apply = (definitions: readonly StorageDefinition[]) => {
      const ids = new Set<string>(), files = new Set<string>();
      const plans: PreparedStorage[] = definitions.map(definition => {
        const plan = definition.inspect();
        if (ids.has(plan.id) || files.has(plan.file)) throw new Error(`Duplicate storage declaration: ${plan.id}.`);
        ids.add(plan.id); files.add(plan.file);
        return plan;
      });
      const changes = plans.flatMap(plan => plan.change ? [plan.change] : []);
      if (changes.length) {
        if (!report?.backupComplete) {
          report = newReport(options.version);
          report.changes = changes;
          backup(root, report);
        } else {
          for (const change of changes) if (!report.changes.some(old => old.id === change.id)) report.changes.push(change);
        }
        report.status = "migrating";
        save(root, report);
      }
      for (const plan of plans) plan.apply();
      for (const plan of plans) plan.validate();
    };
    apply(options.stores);
    if (options.discover) apply(await options.discover());
    options.validate?.();
    if (report) {
      report.status = "succeeded"; report.error = null;
      if (!report.changes.length) report.acknowledged = true;
      save(root, report);
      console.info(`Data preparation completed for recovery record ${report.id}.`);
    }
    return { ok: true, report: report ?? previousSuccess };
  } catch (error) {
    console.error("Data preparation failed.", error);
    report ??= newReport(options.version);
    // 恢复的操作阶段独立于失败信息；下一次重试仍先完成复制／归档。
    if (report.status !== "restoring" && report.status !== "resetting") report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    try { save(root, report); } catch (failure) { console.error("Data preparation failure could not be recorded.", failure); }
    return { ok: false, report };
  }
}

/** 附件存在性在业务回收前检查；未知文件只由后续内容模块处理。 */
export function existingContentFiles(root: string): Set<string> {
  const directory = join(root, "content", "sealed");
  return new Set(existsSync(directory) ? readdirSync(directory) : []);
}
