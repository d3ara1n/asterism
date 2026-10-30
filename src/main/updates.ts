import { app, ipcMain, net, type BrowserWindow } from "electron";
import Store from "electron-store";
import electronUpdater from "electron-updater";
import { prerelease } from "semver";
import { applicationStorage, applicationRepository, applicationUserAgent, preferenceVersion } from "../shared/application.ts";
import { githubReleasesSchema, selectUpdateRelease, type GitHubUpdateRelease } from "./update-release.ts";
import {
  updatesGetChannel, updatesSetChannel, updatesCheckChannel, updatesInstallChannel, updatesChangedChannel,
  type UpdateState,
} from "../shared/updates.ts";

/** The main process owns updates; installation after download uses the app's existing exit flow. */
export class ApplicationUpdates {
  private readonly updater = electronUpdater.autoUpdater;
  private readonly store = new Store<{ version: number; includePrerelease: boolean }>({
    cwd: app.getPath("userData"), name: applicationStorage.updatesStore,
    defaults: { version: preferenceVersion, includePrerelease: prerelease(app.getVersion()) !== null },
  });
  private state: UpdateState = {
    version: app.getVersion(), enabled: app.isPackaged,
    includePrerelease: this.store.get("includePrerelease") === true,
    status: "idle", availableVersion: null, releaseUrl: null, progress: 0, error: null,
  };
  private operation: Promise<UpdateState> | null = null;
  private readonly listeners = new Set<(state: UpdateState) => void>();

  constructor() {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowDowngrade = false;
    this.updater.logger = console;
    this.updater.on("download-progress", progress => this.patch({ progress: progress.percent }));
    // The framework emits error before rejecting the Promise; installation errors also reach settings.
    this.updater.on("error", error => this.failed(error));
  }

  private patch(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
  private failed(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Application update failed.", error);
    this.patch({ status: "error", error: message });
  }
  get(): UpdateState { return this.state; }

  set(includePrerelease: boolean): UpdateState {
    if (this.state.status === "restarting") return this.state;
    this.store.set("includePrerelease", includePrerelease);
    this.patch({ includePrerelease });
    // In-flight checks and downloads finish their work; the next check uses new preferences.
    if (!this.operation) this.patch({ status: "idle", availableVersion: null, releaseUrl: null, progress: 0, error: null });
    return this.state;
  }

  check(): Promise<UpdateState> {
    if (!this.state.enabled || this.state.status === "restarting") return Promise.resolve(this.state);
    if (this.operation) return this.operation;
    this.operation = this.checkAndDownload().finally(() => { this.operation = null; });
    return this.operation;
  }

  private async checkAndDownload(): Promise<UpdateState> {
    const includePrerelease = this.state.includePrerelease;
    this.updater.allowPrerelease = includePrerelease;
    this.updater.allowDowngrade = false;
    this.patch({ status: "checking", availableVersion: null, releaseUrl: null, progress: 0, error: null });
    try {
      const releases: GitHubUpdateRelease[] = [];
      const repository = `${applicationRepository.owner}/${applicationRepository.name}`;
      for (let page = 1; ; page++) {
        const response = await net.fetch(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": applicationUserAgent },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`GitHub release discovery failed (HTTP ${response.status}).`);
        const entries = githubReleasesSchema.parse(await response.json());
        releases.push(...entries);
        if (entries.length < 100) break;
      }
      const candidate = selectUpdateRelease(releases, this.state.version, includePrerelease);
      if (!candidate) { this.patch({ status: "current" }); return this.state; }
      // The generic HTTP provider consumes the selected Release's standard update manifest; the framework still handles download, deltas, and installation.
      this.updater.setFeedURL({
        provider: "generic",
        url: `https://github.com/${repository}/releases/download/${encodeURIComponent(candidate.tag_name)}/`,
        channel: "latest",
        useMultipleRangeRequest: false,
      });
      const result = await this.updater.checkForUpdates();
      if (!result?.isUpdateAvailable) {
        this.patch({ status: "current" });
      } else {
        this.patch({ status: "downloading", availableVersion: result.updateInfo.version, releaseUrl: candidate.html_url });
        await this.updater.downloadUpdate();
        this.patch({ status: "ready", progress: 100 });
      }
    } catch (error) { this.failed(error); }
    return this.state;
  }

  async restart(quit: () => Promise<boolean>): Promise<void> {
    if (this.state.status !== "ready") return;
    this.patch({ status: "restarting", error: null });
    try {
      const started = await quit();
      if (!started && this.get().status === "restarting") this.patch({ status: "ready" });
    } catch (error) { this.failed(error); }
  }

  install(onFailure: (error: Error) => void): void {
    if (this.state.status !== "restarting") return;
    // macOS native signature validation finishes asynchronously afterward; failures can display the startup recovery entry.
    this.updater.once("error", onFailure);
    try { this.updater.quitAndInstall(false, true); }
    catch (error) {
      this.updater.removeListener("error", onFailure);
      const failure = error instanceof Error ? error : new Error(String(error));
      this.failed(failure);
      onFailure(failure);
    }
  }

  serve(window: BrowserWindow, trusted: (event: Electron.IpcMainInvokeEvent) => boolean, install: () => Promise<boolean>): () => void {
    const publish = (state: UpdateState) => {
      if (!window.isDestroyed()) window.webContents.send(updatesChangedChannel, state);
    };
    this.listeners.add(publish);
    const channels = [updatesGetChannel, updatesSetChannel, updatesCheckChannel, updatesInstallChannel];
    for (const channel of channels) ipcMain.removeHandler(channel);
    ipcMain.handle(updatesGetChannel, event => {
      if (!trusted(event)) throw new Error("Untrusted application frame.");
      return this.get();
    });
    ipcMain.handle(updatesSetChannel, (event, value: unknown) => {
      if (!trusted(event) || typeof value !== "boolean") throw new Error("Invalid update preference.");
      return this.set(value);
    });
    ipcMain.handle(updatesCheckChannel, event => {
      if (!trusted(event)) throw new Error("Untrusted application frame.");
      return this.check();
    });
    ipcMain.handle(updatesInstallChannel, event => {
      if (!trusted(event)) throw new Error("Untrusted application frame.");
      return this.restart(install);
    });
    return () => {
      this.listeners.delete(publish);
      for (const channel of channels) ipcMain.removeHandler(channel);
    };
  }
}
