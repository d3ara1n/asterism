import { contextBridge, ipcRenderer } from "electron";
import { commandChannel, statusChannel, commandSchema, resultSchema, runtimeStatusSchema, type DesktopBridge } from "../shared/contracts.ts";
import { configurationChannel, configurationChangedChannel, configurationCommandSchema, configurationResultSchema } from "../shared/configuration.ts";
import { appearanceChangedChannel, appearanceGetChannel, appearancePatchSchema, appearanceSetChannel, parseAppearance } from "../shared/theme.ts";

const bridge: DesktopBridge = {
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
  platform: process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux",
  async execute(command) {
    const parsed = commandSchema.safeParse(command);
    if (!parsed.success) return { ok: false, error: { code: "invalid_request", message: "Invalid application command." } };
    try { return resultSchema.parse(await ipcRenderer.invoke(commandChannel, parsed.data)); }
    catch { return { ok: false, error: { code: "unavailable", message: "The application connection was lost. Restart Weft and inspect the workspace before retrying." } }; }
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
contextBridge.exposeInMainWorld("weft", bridge);
