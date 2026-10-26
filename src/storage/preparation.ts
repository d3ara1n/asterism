import { randomUUID } from "node:crypto";
import { constants, copyFileSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { applicationStorage } from "../shared/application.ts";
import { recoveryPointSchema, type PluginStorageFailure, type PreparationResult, type RecoveryPoint } from "../shared/recovery.ts";
import { readJson, writeJson } from "./files.ts";
import type { StorageChange, StorageDefinition, StoragePlan } from "./migrations.ts";

/** 恢复点中的一项应用数据；`link` 标记一次写入的不可变文件，以硬链接共享字节。 */
export interface DataPath { path: string; link?: boolean }
/** 保留最近的完整恢复点数；进行中操作引用的恢复点不计入清理。 */
export const pointRetention = 7;

const recoveryRoot = (root: string) => join(root, applicationStorage.recoveryDirectory);
const pointsRoot = (root: string) => join(recoveryRoot(root), "points");
const stateFile = (root: string) => join(recoveryRoot(root), "state.json");
export const recoveryPointDirectory = (root: string, id: string) => join(pointsRoot(root), id);
const pointFile = (root: string, id: string) => join(recoveryPointDirectory(root, id), "point.json");
const pointFiles = (root: string, id: string) => join(recoveryPointDirectory(root, id), "files");

/** 只在恢复操作进行中或还原后暂停时存在；迁移本身不需要持久状态。 */
const stateSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("restoring"), target: z.string(), displaced: z.string() }),
  z.object({ phase: z.literal("resetting"), displaced: z.string() }),
  z.object({ phase: z.literal("restored") }),
]);
type RecoveryState = z.infer<typeof stateSchema>;
function readState(root: string): RecoveryState | null {
  const raw = readJson(stateFile(root));
  return raw === undefined ? null : stateSchema.parse(raw);
}
function saveState(root: string, state: RecoveryState | null): void {
  if (state) writeJson(stateFile(root), state);
  else rmSync(stateFile(root), { force: true });
}

/** 目录名以创建时间开头，字典序即时间序。 */
function newPointId(): string {
  return `${new Date().toISOString().replace(/[:.]/gu, "-")}-${randomUUID().slice(0, 8)}`;
}
/** `point.json` 最后写入，存在即表示恢复点完整。 */
function readPoint(root: string, id: string): RecoveryPoint | null {
  try {
    const parsed = recoveryPointSchema.safeParse(readJson(pointFile(root, id)));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
function writePoint(root: string, point: RecoveryPoint): void { writeJson(pointFile(root, point.id), point); }
export function listRecoveryPoints(root: string): RecoveryPoint[] {
  if (!existsSync(pointsRoot(root))) return [];
  return readdirSync(pointsRoot(root)).sort().reverse().flatMap(id => readPoint(root, id) ?? []);
}

/** 写时复制在 APFS、Btrfs、ReFS 上克隆数据块，其他文件系统退化为普通复制。 */
function copy(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  cpSync(source, destination, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
}
const unlinkable = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV", "EMLINK"]);
/** 封存内容只写入一次，多个恢复点与工作目录共享同一份字节；FAT／exFAT 等不支持硬链接时复制。 */
function link(source: string, destination: string): void {
  if (lstatSync(source).isDirectory()) {
    mkdirSync(destination, { recursive: true, mode: 0o700 });
    for (const name of readdirSync(source)) link(join(source, name), join(destination, name));
    return;
  }
  try { linkSync(source, destination); }
  catch (error) {
    if (!unlinkable.has((error as NodeJS.ErrnoException).code ?? "")) throw error;
    copyFileSync(source, destination, constants.COPYFILE_FICLONE);
  }
}
function place(item: DataPath, source: string, destination: string): void {
  if (item.link) { mkdirSync(dirname(destination), { recursive: true, mode: 0o700 }); link(source, destination); }
  else copy(source, destination);
}

/** 保留最近的完整恢复点；未写完 `point.json` 的目录直接清除。 */
function prune(root: string, keep: readonly string[]): void {
  if (!existsSync(pointsRoot(root))) return;
  let complete = 0;
  for (const id of readdirSync(pointsRoot(root)).sort().reverse()) {
    const valid = readPoint(root, id) !== null;
    if (valid) complete++;
    if (keep.includes(id) || (valid && complete <= pointRetention)) continue;
    rmSync(recoveryPointDirectory(root, id), { recursive: true, force: true });
  }
}

/** 迁移前复制整组数据；工作数据保持原样，复制完成后才写入 `point.json`。 */
function snapshot(root: string, paths: readonly DataPath[], version: string, changes: StorageChange[]): string {
  const id = newPointId();
  mkdirSync(pointFiles(root, id), { recursive: true, mode: 0o700 });
  for (const item of paths) {
    const source = join(root, item.path);
    if (existsSync(source)) place(item, source, join(pointFiles(root, id), item.path));
  }
  writePoint(root, { version: 1, id, kind: "migration", createdAt: new Date().toISOString(), applicationVersion: version, changes, notice: false });
  prune(root, [id]);
  return id;
}

/** 还原先把当前数据整体移入新恢复点，再从目标恢复点复制；重启后暂停自动迁移。 */
export function restorePoint(root: string, paths: readonly DataPath[], target: string, version: string): void {
  if (!readPoint(root, target)) throw new Error("The recovery point is unavailable.");
  saveState(root, { phase: "restoring", target, displaced: newPointId() });
  continueRecovery(root, paths, version);
}
/** 重新开始把当前数据移入新恢复点，随后由业务层按新用户创建。 */
export function startFresh(root: string, paths: readonly DataPath[], version: string): void {
  saveState(root, { phase: "resetting", displaced: newPointId() });
  continueRecovery(root, paths, version);
}
/** 每一步可重复执行：已移走的项不再移动，还原目标先清除再复制。 */
function continueRecovery(root: string, paths: readonly DataPath[], version: string): void {
  const state = readState(root);
  if (!state || state.phase === "restored") return;
  if (!readPoint(root, state.displaced)) {
    const files = pointFiles(root, state.displaced);
    mkdirSync(files, { recursive: true, mode: 0o700 });
    for (const item of paths) {
      const source = join(root, item.path), destination = join(files, item.path);
      if (!existsSync(source) || existsSync(destination)) continue;
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      renameSync(source, destination);
    }
    writePoint(root, { version: 1, id: state.displaced, kind: state.phase === "restoring" ? "before-restore" : "before-fresh",
      createdAt: new Date().toISOString(), applicationVersion: version, changes: [], notice: false });
    prune(root, state.phase === "restoring" ? [state.target, state.displaced] : [state.displaced]);
  }
  if (state.phase === "resetting") { saveState(root, null); return; }
  const source = pointFiles(root, state.target);
  for (const item of paths) {
    const destination = join(root, item.path);
    rmSync(destination, { recursive: true, force: true });
    if (existsSync(join(source, item.path))) place(item, join(source, item.path), destination);
  }
  saveState(root, { phase: "restored" });
}
/** 用户明确重试后解除还原后的暂停。 */
export function clearPause(root: string): void {
  if (readState(root)?.phase === "restored") saveState(root, null);
}

export function pendingNotice(root: string): RecoveryPoint | null {
  return listRecoveryPoints(root).find(point => point.notice) ?? null;
}
export function acknowledgeNotice(root: string): void {
  for (const point of listRecoveryPoints(root)) if (point.notice) writePoint(root, { ...point, notice: false });
}

export interface PluginStorageGroup { id: string; stores: readonly StorageDefinition[]; error?: string }
export interface PreparationOptions {
  version: string;
  paths: readonly DataPath[];
  stores: readonly StorageDefinition[];
  /** 宿主存储就绪后发现插件声明；插件失败只禁用该插件。 */
  discover?: () => Promise<readonly PluginStorageGroup[]>;
  /** 宿主存储检查完成即通知；需要迁移时先报告 migrating，提交后报告 ready。 */
  onHost?: (status: "migrating" | "ready") => void;
}
const plansOf = (stores: readonly StorageDefinition[]): StoragePlan[] => stores.flatMap(store => store.inspect() ?? []);
const sameChange = (a: StorageChange, b: StorageChange) => a.id === b.id && a.from === b.from && a.to === b.to;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function prepareData(root: string, options: PreparationOptions): Promise<PreparationResult> {
  let paused = false;
  try {
    continueRecovery(root, options.paths, options.version);
    paused = readState(root)?.phase === "restored";
    const host = plansOf(options.stores);
    if (paused && host.length) throw new Error("Automatic migration is paused after restoring a recovery point. Retry when you are ready.");
    options.onHost?.(host.length ? "migrating" : "ready");
    let point: RecoveryPoint | null = null;
    // 同一组变化的重试沿用最近的迁移恢复点，避免反复失败挤掉更早的恢复点。
    const record = (changes: StorageChange[]) => {
      if (!changes.length) return;
      if (point) {
        point = { ...point, changes: [...point.changes, ...changes.filter(change => !point!.changes.some(old => sameChange(old, change)))] };
        writePoint(root, point);
        return;
      }
      const latest = listRecoveryPoints(root)[0];
      if (latest?.kind === "migration" && changes.every(change => latest.changes.some(old => sameChange(old, change)))) point = latest;
      else point = readPoint(root, snapshot(root, options.paths, options.version, changes));
    };
    record(host.map(plan => plan.change));
    for (const plan of host) plan.apply();
    if (paused) saveState(root, null);
    if (host.length) options.onHost?.("ready");
    const plugins: PluginStorageFailure[] = [];
    for (const group of options.discover ? await options.discover() : []) {
      try {
        if (group.error) throw new Error(group.error);
        const plans = plansOf(group.stores);
        record(plans.map(plan => plan.change));
        for (const plan of plans) plan.apply();
      } catch (error) {
        console.error(`Storage of plugin ${group.id} could not be prepared.`, error);
        plugins.push({ id: group.id, error: message(error) });
      }
    }
    const finished = point as RecoveryPoint | null;
    if (finished && !plugins.length) writePoint(root, { ...finished, notice: true });
    if (finished) console.info(`Data migration recorded in recovery point ${finished.id}.`);
    return { ok: true, plugins };
  } catch (error) {
    console.error("Data preparation failed.", error);
    return { ok: false, error: message(error), paused };
  }
}
