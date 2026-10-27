import { randomUUID } from "node:crypto";
import { constants, copyFileSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { applicationStorage } from "../shared/application.ts";
import { recoveryPointSchema, type PluginStorageFailure, type PreparationProgress, type PreparationResult, type RecoveryPoint } from "../shared/recovery.ts";
import { readJson, writeJson } from "./files.ts";
import type { StorageChange, StorageDefinition, StoragePlan } from "./migrations.ts";

/** One application data item in recovery points; `link` marks immutable files written once and shared by hard links. */
export interface DataPath { path: string; link?: boolean }
/** Number of recent complete recovery points to retain; points referenced by active operations are excluded from cleanup. */
export const pointRetention = 7;

const recoveryRoot = (root: string) => join(root, applicationStorage.recoveryDirectory);
const pointsRoot = (root: string) => join(recoveryRoot(root), "points");
const stateFile = (root: string) => join(recoveryRoot(root), "state.json");
export const recoveryPointDirectory = (root: string, id: string) => join(pointsRoot(root), id);
const pointFile = (root: string, id: string) => join(recoveryPointDirectory(root, id), "point.json");
const pointFiles = (root: string, id: string) => join(recoveryPointDirectory(root, id), "files");

/** Exists only during recovery or post-restoration pause; migration itself needs no persistent state. */
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

/** Directory names begin with creation times, making lexical order chronological. */
function newPointId(): string {
  return `${new Date().toISOString().replace(/[:.]/gu, "-")}-${randomUUID().slice(0, 8)}`;
}
/** Write `point.json` last; its presence marks a complete recovery point. */
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

/** Copy-on-write clones blocks on APFS, Btrfs, and ReFS; other filesystems fall back to ordinary copies. */
function copy(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  cpSync(source, destination, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
}
const unlinkable = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV", "EMLINK"]);
/** Sealed content is written once and shared by recovery points and working directories; copy on filesystems without hard links, such as FAT/exFAT. */
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

/** Retain recent complete recovery points; directly remove directories without completed `point.json`. */
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

/** Copy the complete data set before migration without changing working data; write `point.json` only after copying finishes. */
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

/** Restoration first moves all current data into a new recovery point, then copies the target point; pause automatic migration after restart. */
export function restorePoint(root: string, paths: readonly DataPath[], target: string, version: string): void {
  if (!readPoint(root, target)) throw new Error("The recovery point is unavailable.");
  saveState(root, { phase: "restoring", target, displaced: newPointId() });
  continueRecovery(root, paths, version);
}
/** Starting over moves current data into new recovery points before business logic creates data for a new user. */
export function startFresh(root: string, paths: readonly DataPath[], version: string): void {
  saveState(root, { phase: "resetting", displaced: newPointId() });
  continueRecovery(root, paths, version);
}
/** Each step is repeatable: do not move already moved items; clear restoration targets before copying. */
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
/** Clear post-restoration pause after explicit user retry. */
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
  /** Discover plugin declarations after host storage is ready; plugin failures disable only that plugin. */
  discover?: () => Promise<readonly PluginStorageGroup[]>;
  /** Notify when host storage checks finish; report migrating before required migration and ready after commit. */
  onHost?: (status: "migrating" | "ready") => void;
  onProgress?: (progress: PreparationProgress) => void;
}
const plansOf = (stores: readonly StorageDefinition[]): StoragePlan[] => stores.flatMap(store => store.inspect() ?? []);
const sameChange = (a: StorageChange, b: StorageChange) => a.id === b.id && a.from === b.from && a.to === b.to;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function prepareData(root: string, options: PreparationOptions): Promise<PreparationResult> {
  let paused = false;
  try {
    options.onProgress?.({ stage: "dataCheck" });
    continueRecovery(root, options.paths, options.version);
    paused = readState(root)?.phase === "restored";
    const host = plansOf(options.stores);
    if (paused && host.length) throw new Error("Automatic migration is paused after restoring a recovery point. Retry when you are ready.");
    options.onHost?.(host.length ? "migrating" : "ready");
    let point: RecoveryPoint | null = null;
    // Retries of the same changes reuse the latest migration recovery point so repeated failures cannot evict older points.
    const record = (changes: StorageChange[]) => {
      if (!changes.length) return;
      if (point) {
        point = { ...point, changes: [...point.changes, ...changes.filter(change => !point!.changes.some(old => sameChange(old, change)))] };
        writePoint(root, point);
        return;
      }
      const latest = listRecoveryPoints(root)[0];
      if (latest?.kind === "migration" && changes.every(change => latest.changes.some(old => sameChange(old, change)))) point = latest;
      else {
        options.onProgress?.({ stage: "dataBackup" });
        point = readPoint(root, snapshot(root, options.paths, options.version, changes));
      }
    };
    const apply = (plan: StoragePlan) => {
      options.onProgress?.({ stage: "data", detail: plan.change.id });
      const started = performance.now();
      console.info(`Storage migration started. storage=${plan.change.id} from=${plan.change.from} to=${plan.change.to}`);
      plan.apply();
      console.info(`Storage migration completed. storage=${plan.change.id} elapsedMs=${Math.round(performance.now() - started)}`);
    };
    record(host.map(plan => plan.change));
    for (const plan of host) apply(plan);
    if (paused) saveState(root, null);
    if (host.length) options.onHost?.("ready");
    const plugins: PluginStorageFailure[] = [];
    options.onProgress?.({ stage: "dataPlugins" });
    for (const group of options.discover ? await options.discover() : []) {
      try {
        options.onProgress?.({ stage: "dataPlugins", detail: group.id });
        if (group.error) throw new Error(group.error);
        const plans = plansOf(group.stores);
        record(plans.map(plan => plan.change));
        for (const plan of plans) apply(plan);
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
