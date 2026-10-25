import { contextBridge, ipcRenderer, webUtils } from "electron";
import { languageGetChannel, languageSetChannel, languageChangedChannel, languagePreferenceSchema, languageStateSchema } from "../shared/language.ts";
import { desktopBridgeKey } from "../shared/core.ts";
import { desktopWindowChangedChannel, desktopWindowGetChannel, desktopWindowStateSchema } from "../shared/desktop.ts";
import { pickDirectoryChannel, openLocalFileChannel, openLogsChannel, localFilePathSchema, statusChannel, runtimeStatusSchema, type DesktopBridge } from "../shared/contracts.ts";
import { connectionPortMessage, connectionRequestChannel } from "../shared/connection.ts";
import { appearanceChangedChannel, appearanceGetChannel, appearancePatchSchema, appearanceSetChannel, parseAppearance } from "../shared/theme.ts";
import { preferencesGetChannel, preferencesSetChannel, preferenceWriteSchema, uiStateSchemas } from "../shared/ui-state.ts";
import { startupGetChannel, startupChangedChannel, startupRestartChannel, startupDataDirectoryChannel, startupStateSchema } from "../shared/startup.ts";

let connectionRequested = false;
// 端口直接交给页面：业务消息不经 contextBridge 二次克隆。主进程只接受受信主框架的请求。
ipcRenderer.on(connectionRequestChannel, event => {
  window.postMessage({ type: connectionPortMessage }, "*", event.ports.length ? [event.ports[0]!] : []);
});
const bridge: DesktopBridge = {
  startup: {
    async get() { return startupStateSchema.parse(await ipcRenderer.invoke(startupGetChannel)); },
    onChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
        const parsed = startupStateSchema.safeParse(raw);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(startupChangedChannel, handler);
      return () => ipcRenderer.removeListener(startupChangedChannel, handler);
    },
    async restart() { await ipcRenderer.invoke(startupRestartChannel); },
    async openDataDirectory() {
      const result: unknown = await ipcRenderer.invoke(startupDataDirectoryChannel);
      return typeof result === "string" ? result : "The data folder could not be opened.";
    },
  },
  language: {
    async get() { return languageStateSchema.parse(await ipcRenderer.invoke(languageGetChannel)); },
    async set(preference) { return languageStateSchema.parse(await ipcRenderer.invoke(languageSetChannel, languagePreferenceSchema.parse(preference))); },
    onChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
        const parsed = languageStateSchema.safeParse(raw); if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(languageChangedChannel, handler);
      return () => ipcRenderer.removeListener(languageChangedChannel, handler);
    },
  },
  appearance: {
    async get() { return parseAppearance(await ipcRenderer.invoke(appearanceGetChannel), process.platform); },
    async set(patch) { return parseAppearance(await ipcRenderer.invoke(appearanceSetChannel, appearancePatchSchema.parse(patch)), process.platform); },
    onChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => listener(parseAppearance(raw, process.platform));
      ipcRenderer.on(appearanceChangedChannel, handler);
      return () => ipcRenderer.removeListener(appearanceChangedChannel, handler);
    },
  },
  preferences: {
    async read() {
      const raw = await ipcRenderer.invoke(preferencesGetChannel).catch(() => ({}));
      const parsed = uiStateSchemas.preferences.safeParse(raw);
      return parsed.success ? parsed.data : {};
    },
    async write(key, value) {
      const parsed = preferenceWriteSchema.safeParse({ key, value });
      if (!parsed.success) return false;
      return (await ipcRenderer.invoke(preferencesSetChannel, parsed.data).catch(() => false)) === true;
    },
  },
  async pickDirectory() {
    const path = await ipcRenderer.invoke(pickDirectoryChannel);
    return typeof path === "string" ? path : null;
  },
  async openLocalFile(path) {
    const result: unknown = await ipcRenderer.invoke(openLocalFileChannel, localFilePathSchema.parse(path));
    return typeof result === "string" ? result : "The local file could not be opened.";
  },
  async openLogs() {
    const result: unknown = await ipcRenderer.invoke(openLogsChannel);
    return typeof result === "string" ? result : "The log folder could not be opened.";
  },
  pathForFile: file => webUtils.getPathForFile(file),
  platform: process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux",
  window: {
    async get() { return desktopWindowStateSchema.parse(await ipcRenderer.invoke(desktopWindowGetChannel)); },
    onChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
        const parsed = desktopWindowStateSchema.safeParse(raw);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(desktopWindowChangedChannel, handler);
      return () => ipcRenderer.removeListener(desktopWindowChangedChannel, handler);
    },
  },
  connectRuntime() {
    if (connectionRequested) return;
    connectionRequested = true;
    ipcRenderer.send(connectionRequestChannel);
  },
  onStatus(listener) {
    const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      const status = runtimeStatusSchema.safeParse(raw);
      if (status.success) listener(status.data);
    };
    ipcRenderer.on(statusChannel, handler);
    return () => ipcRenderer.removeListener(statusChannel, handler);
  },
};
contextBridge.exposeInMainWorld(desktopBridgeKey, bridge);
