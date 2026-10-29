import { join } from "node:path";
import type { StartupStage, StartupState } from "../shared/startup.ts";
import type { PluginStorageFailure, PreparationResult, RecoveryAction, RecoveryPoint } from "../shared/recovery.ts";
import { listRecoveryPoints } from "../storage/preparation.ts";
import { PreparationTerminationError, prepareDataProcess, type PreparationAction } from "./data-preparation.ts";
import { adoptLoginShellEnvironment } from "./shell-environment.ts";

interface StartupOptions {
  directory: string;
  root: string;
  version: string;
  publish(state: StartupState): void;
  showWindow(): void;
  settingsReady(): void;
  startRuntime(failures: readonly PluginStorageFailure[], pluginBuild: string): Promise<void>;
}

/** The main process owns background startup order, stages, and cancellation scopes; windows only consume status and settings-availability notifications. */
export class StartupCoordinator {
  state: StartupState = { status: "starting", stage: "dataCheck" };
  storageFailures: PluginStorageFailure[] = [];
  private readonly lifetime = new AbortController();
  private preparation: Promise<PreparationResult> | null = null;
  private changedAt = performance.now();

  constructor(private readonly options: StartupOptions) {}

  publish(state: StartupState): void {
    console.info(`Startup state changed. previous=${this.state.status === "starting" ? this.state.stage : this.state.status} elapsedMs=${Math.round(performance.now() - this.changedAt)}`, state);
    this.changedAt = performance.now();
    this.state = state;
    this.options.publish(state);
  }

  stage(stage: StartupStage, detail?: string): void {
    this.publish({ status: "starting", stage, ...(detail ? { detail } : {}) });
  }

  private prepare(action: PreparationAction): Promise<PreparationResult> {
    const { directory, root, version } = this.options;
    const work = prepareDataProcess(join(directory, "prepare-data.js"), root, version, action, this.lifetime.signal,
      status => {
        if (status === "ready") this.options.settingsReady();
        this.options.showWindow();
      },
      progress => this.stage(progress.stage, progress.detail),
      () => { if (action.kind === "prepare") this.stage("dataFinalizing"); });
    this.preparation = work;
    return work.finally(() => { this.preparation = null; });
  }

  private async environment(): Promise<void> {
    const deadline = new AbortController();
    const signal = AbortSignal.any([this.lifetime.signal, deadline.signal]);
    const timer = setTimeout(() => deadline.abort(Object.assign(
      new Error("Login shell initialization timed out after 20 seconds."), { reason: "timeout" })), 20_000);
    let abort = () => {};
    try {
      signal.throwIfAborted();
      await Promise.race([
        adoptLoginShellEnvironment(signal),
        new Promise<never>((_, reject) => {
          abort = () => reject(signal.reason);
          signal.addEventListener("abort", abort, { once: true });
        }),
      ]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }

  async run(): Promise<void> {
    try {
      let result: PreparationResult;
      try { result = await this.prepare({ kind: "prepare" }); }
      catch (error) {
        if (this.lifetime.signal.aborted) return;
        // Preparation failures with confirmed exit still offer recovery; processes with unconfirmed liveness use the general startup failure flow.
        if (error instanceof PreparationTerminationError) throw error;
        console.error("Data preparation failed.", error);
        result = { ok: false, error: error instanceof Error ? error.message : String(error), paused: false };
      }
      this.lifetime.signal.throwIfAborted();
      if (!result.ok) {
        let points: RecoveryPoint[] = [];
        try { points = listRecoveryPoints(this.options.root); }
        catch (error) { console.error("Recovery points could not be read.", error); }
        this.publish({ status: "failed", reason: "data", detail: result.error, recovery: { paused: result.paused, points } });
        this.options.showWindow();
        return;
      }
      this.storageFailures = result.plugins;
      this.stage("environment");
      await this.environment();
      this.lifetime.signal.throwIfAborted();
      this.stage("plugins");
      if (!result.pluginBuild) throw new Error("Data preparation did not provide a plugin build.");
      await this.options.startRuntime(result.plugins, result.pluginBuild);
    } catch (error) {
      if (this.lifetime.signal.aborted) return;
      console.error("Application startup failed.", error);
      const reason = (error as { reason?: string })?.reason;
      this.publish({ status: "failed", reason: reason === "database_version" || reason === "timeout" ? reason : "initialization",
        detail: error instanceof Error ? error.message : String(error) });
      this.options.showWindow();
    }
  }

  async recover(action: RecoveryAction): Promise<void> {
    try {
      const result = await this.prepare(action);
      if (!result.ok) throw new Error(result.error);
    } catch (error) {
      if (this.lifetime.signal.aborted) throw error;
      console.error("Data recovery failed.", error);
      if (error instanceof PreparationTerminationError)
        this.publish({ status: "failed", reason: "initialization", detail: error.message });
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.lifetime.abort();
    await this.preparation?.catch(() => {});
  }
}
