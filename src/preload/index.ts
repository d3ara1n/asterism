import { contextBridge, ipcRenderer, webUtils } from "electron";
import { applicationBrand } from "../shared/application.ts";
import { desktopBridgeKey } from "../shared/core.ts";
import { commandChannel, pickDirectoryChannel, statusChannel, commandSchema, resultSchema, runtimeStatusSchema, type DesktopBridge } from "../shared/contracts.ts";
import { configurationChannel, configurationChangedChannel, configurationCommandSchema, configurationResultSchema } from "../shared/configuration.ts";
import { appearanceChangedChannel, appearanceGetChannel, appearancePatchSchema, appearanceSetChannel, parseAppearance } from "../shared/theme.ts";
import { sessionChannel, sessionChangedChannel, sessionCommandSchema, sessionResultSchema, sessionChangedSchema } from "../shared/session.ts";

const bridge: DesktopBridge = {
  session: {
    async execute(command) {
      const parsed = sessionCommandSchema.safeParse(command);
      if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid session command." } };
      try { return sessionResultSchema.parse(await ipcRenderer.invoke(sessionChannel, parsed.data)); }
      catch { return { ok: false, error: { code: "unavailable", message: "The session connection was lost. Reopen history before retrying." } }; }
    },
    onChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
        const parsed = sessionChangedSchema.safeParse(raw);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(sessionChangedChannel, handler);
      return () => ipcRenderer.removeListener(sessionChangedChannel, handler);
    },
  },
  appearance: {
    async get() { return parseAppearance(await ipcRenderer.invoke(appearanceGetChannel)); },
    async set(patch) { return parseAppearance(await ipcRenderer.invoke(appearanceSetChannel, appearancePatchSchema.parse(patch))); },
    onChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => listener(parseAppearance(raw));
      ipcRenderer.on(appearanceChangedChannel, handler);
      return () => ipcRenderer.removeListener(appearanceChangedChannel, handler);
    },
  },
  configuration: {
    async execute(command) {
      const parsed = configurationCommandSchema.safeParse(command);
      if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid configuration command." } };
      try { return configurationResultSchema.parse(await ipcRenderer.invoke(configurationChannel, parsed.data)); }
      catch { return { ok: false, error: { code: "unavailable", message: "The configuration connection was lost. Reload settings before retrying." } }; }
    },
    onChanged(listener) {
      const handler = () => listener();
      ipcRenderer.on(configurationChangedChannel, handler);
      return () => ipcRenderer.removeListener(configurationChangedChannel, handler);
    },
  },
  async pickDirectory() {
    const path = await ipcRenderer.invoke(pickDirectoryChannel);
    return typeof path === "string" ? path : null;
  },
  pathForFile: file => webUtils.getPathForFile(file),
  platform: process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux",
  async execute(command) {
    const parsed = commandSchema.safeParse(command);
    if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid application command." } };
    try { return resultSchema.parse(await ipcRenderer.invoke(commandChannel, parsed.data)); }
    catch { return { ok: false, error: { code: "unavailable", message: `The application connection was lost. Restart ${applicationBrand.en} and inspect the workspace before retrying.` } }; }
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
