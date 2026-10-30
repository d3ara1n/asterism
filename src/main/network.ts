import { app, ipcMain, session, type BrowserWindow, type ProxyConfig } from "electron";
import Store from "electron-store";
import electronUpdater from "electron-updater";
import { applicationStorage, preferenceVersion } from "../shared/application.ts";
import {
  defaultNetworkPreference, networkPreferenceSchema, networkGetChannel, networkSetChannel, networkChangedChannel,
  type NetworkPreference, type NetworkState,
} from "../shared/network.ts";

/** Saved preferences take effect together at startup, before any application requests. */
export class ApplicationNetwork {
  private readonly store = new Store<{ version: number; preference: NetworkPreference }>({
    cwd: app.getPath("userData"), name: applicationStorage.networkStore,
    defaults: { version: preferenceVersion, preference: defaultNetworkPreference },
  });
  private readonly active = networkPreferenceSchema.parse(this.store.get("preference"));

  get(): NetworkState {
    const preference = networkPreferenceSchema.parse(this.store.get("preference"));
    const effective = (value: NetworkPreference) => value.mode === "custom"
      ? [value.mode, value.server, value.bypass] : [value.mode];
    return { preference, restartRequired: JSON.stringify(effective(preference)) !== JSON.stringify(effective(this.active)) };
  }

  async apply(): Promise<void> {
    const config: ProxyConfig = this.active.mode === "custom"
      ? { mode: "fixed_servers", proxyRules: this.active.server, proxyBypassRules: this.active.bypass }
      : { mode: this.active.mode };
    await Promise.all([
      app.setProxy(config),
      session.defaultSession.setProxy(config),
      electronUpdater.autoUpdater.netSession.setProxy(config),
    ]);
  }

  serve(window: BrowserWindow, trusted: (event: Electron.IpcMainInvokeEvent) => boolean): () => void {
    for (const channel of [networkGetChannel, networkSetChannel]) ipcMain.removeHandler(channel);
    ipcMain.handle(networkGetChannel, event => {
      if (!trusted(event)) throw new Error("Untrusted application frame.");
      return this.get();
    });
    ipcMain.handle(networkSetChannel, (event, raw: unknown) => {
      if (!trusted(event)) throw new Error("Untrusted application frame.");
      this.store.set("preference", networkPreferenceSchema.parse(raw));
      const state = this.get();
      if (!window.isDestroyed()) window.webContents.send(networkChangedChannel, state);
      return state;
    });
    return () => {
      ipcMain.removeHandler(networkGetChannel);
      ipcMain.removeHandler(networkSetChannel);
    };
  }
}
