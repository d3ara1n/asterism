import { app, ipcMain, type BrowserWindow } from "electron";
import Store from "electron-store";
import electronUpdater from "electron-updater";
import { prerelease } from "semver";
import { applicationStorage } from "../shared/application.ts";
import {
  updatesGetChannel, updatesSetChannel, updatesCheckChannel, updatesInstallChannel, updatesChangedChannel,
  type UpdateState,
} from "../shared/updates.ts";

/** 更新服务由主进程持有；下载完成后通过应用已有退出流程安装。 */
export class ApplicationUpdates {
  private readonly updater = electronUpdater.autoUpdater;
  private readonly store = new Store<{ includePrerelease: boolean }>({
    cwd: app.getPath("userData"), name: applicationStorage.updatesStore,
    defaults: { includePrerelease: prerelease(app.getVersion()) !== null },
  });
  private state: UpdateState = {
    version: app.getVersion(), enabled: app.isPackaged,
    includePrerelease: this.store.get("includePrerelease") === true,
    status: "idle", availableVersion: null, progress: 0, error: null,
  };
  private operation: Promise<UpdateState> | null = null;
  private readonly listeners = new Set<(state: UpdateState) => void>();

  constructor() {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowDowngrade = false;
    this.updater.logger = console;
    this.updater.on("download-progress", progress => this.patch({ progress: progress.percent }));
    // 框架会在 Promise 拒绝前发出 error；安装阶段的错误同样进入设置页。
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
    this.store.set("includePrerelease", includePrerelease);
    this.patch({ includePrerelease });
    // 在途检查和下载完成本次工作，下一次检查使用新偏好。
    if (!this.operation) this.patch({ status: "idle", availableVersion: null, progress: 0, error: null });
    return this.state;
  }

  check(): Promise<UpdateState> {
    if (!this.state.enabled) return Promise.resolve(this.state);
    if (this.operation) return this.operation;
    this.operation = this.checkAndDownload().finally(() => { this.operation = null; });
    return this.operation;
  }

  private async checkAndDownload(): Promise<UpdateState> {
    this.updater.allowPrerelease = this.state.includePrerelease;
    this.updater.allowDowngrade = false;
    this.patch({ status: "checking", availableVersion: null, progress: 0, error: null });
    try {
      const result = await this.updater.checkForUpdates();
      if (!result?.isUpdateAvailable) {
        this.patch({ status: "current" });
      } else {
        this.patch({ status: "downloading", availableVersion: result.updateInfo.version });
        await this.updater.downloadUpdate();
        this.patch({ status: "ready", progress: 100 });
      }
    } catch (error) { this.failed(error); }
    return this.state;
  }

  get ready(): boolean { return this.state.status === "ready"; }
  install(onFailure: (error: Error) => void): void {
    if (!this.ready) return;
    // macOS 的原生签名校验在此后异步完成，失败时应用可显示启动恢复入口。
    this.updater.once("error", onFailure);
    try { this.updater.quitAndInstall(false, true); }
    catch (error) {
      this.updater.removeListener("error", onFailure);
      const failure = error instanceof Error ? error : new Error(String(error));
      this.failed(failure);
      onFailure(failure);
    }
  }

  serve(window: BrowserWindow, trusted: (event: Electron.IpcMainInvokeEvent) => boolean, install: () => void): () => void {
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
    ipcMain.handle(updatesInstallChannel, event => { if (trusted(event) && this.ready) install(); });
    return () => {
      this.listeners.delete(publish);
      for (const channel of channels) ipcMain.removeHandler(channel);
    };
  }
}
