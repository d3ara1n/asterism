import { contextBridge, ipcRenderer, webUtils } from "electron";
import { languageGetChannel, languageSetChannel, languageChangedChannel, languagePreferenceSchema, languageStateSchema } from "../shared/language.ts";
import { applicationBrand } from "../shared/application.ts";
import { desktopBridgeKey } from "../shared/core.ts";
import { desktopWindowChangedChannel, desktopWindowGetChannel, desktopWindowStateSchema } from "../shared/desktop.ts";
import { commandChannel, pickDirectoryChannel, statusChannel, resultSchema, runtimeStatusSchema, type DesktopBridge } from "../shared/contracts.ts";
import { objectStreamChannel, objectStreamSchema } from "../shared/object-stream.ts";
import { configurationChannel, configurationChangedChannel, configurationResultSchema } from "../shared/configuration.ts";
import { appearanceChangedChannel, appearanceGetChannel, appearancePatchSchema, appearanceSetChannel, parseAppearance } from "../shared/theme.ts";
import { sessionChannel, sessionChangedChannel, sessionResultSchema, sessionChangedSchema } from "../shared/session.ts";
import { preferencesGetChannel, preferencesSetChannel, preferenceWriteSchema, uiStateSchemas } from "../shared/ui-state.ts";
import { pluginConfigurationChangedChannel, pluginConfigurationChannel, pluginConfigurationResultSchema } from "../shared/plugin-configuration.ts";
import { contentChannel, contentResultSchema } from "../shared/content.ts";
import { pluginEventsChannel, eventFrameSchema } from "../shared/plugin-events.ts";
import { pluginCallsChannel, callFrameSchema } from "../shared/plugin-calls.ts";

const bridge: DesktopBridge = {
  calls: {
    send(control) { ipcRenderer.send(pluginCallsChannel, control); },
    onFrame(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
        const parsed = callFrameSchema.safeParse(raw);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(pluginCallsChannel, handler);
      return () => ipcRenderer.removeListener(pluginCallsChannel, handler);
    },
  },
  events: {
    send(control) { ipcRenderer.send(pluginEventsChannel, control); },
    onFrame(listener) {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
        const parsed = eventFrameSchema.safeParse(raw);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(pluginEventsChannel, handler);
      return () => ipcRenderer.removeListener(pluginEventsChannel, handler);
    },
  },
  content: {
    async execute(command) {
      try { return contentResultSchema.parse(await ipcRenderer.invoke(contentChannel, command)); }
      catch { return { ok: false, error: { code: "unavailable", message: "The content connection was lost." } }; }
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
  pluginConfiguration: {
    async execute(command) {
      try { return pluginConfigurationResultSchema.parse(await ipcRenderer.invoke(pluginConfigurationChannel, command)); }
      catch { return { ok: false, error: { code: "unavailable", message: "The plugin configuration connection was lost. Reload before retrying." } }; }
    },
    onChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, id: unknown) => { if (typeof id === "string") listener(id); };
      ipcRenderer.on(pluginConfigurationChangedChannel, handler);
      return () => ipcRenderer.removeListener(pluginConfigurationChangedChannel, handler);
    },
  },
  session: {
    async execute(command) {
      try { return sessionResultSchema.parse(await ipcRenderer.invoke(sessionChannel, command)); }
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
      try { return configurationResultSchema.parse(await ipcRenderer.invoke(configurationChannel, command)); }
      catch { return { ok: false, error: { code: "unavailable", message: "The configuration connection was lost. Reload settings before retrying." } }; }
    },
    onChanged(listener) {
      const handler = () => listener();
      ipcRenderer.on(configurationChangedChannel, handler);
      return () => ipcRenderer.removeListener(configurationChangedChannel, handler);
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
  async execute(command) {
    try { return resultSchema.parse(await ipcRenderer.invoke(commandChannel, command)); }
    catch { return { ok: false, error: { code: "unavailable", message: `The application connection was lost. Restart ${applicationBrand.en} and inspect the workspace before retrying.` } }; }
  },
  onObjectStream(sessionId, objectId, listener) {
    const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      const parsed = objectStreamSchema.safeParse(raw);
      if (parsed.success && parsed.data.sessionId === sessionId && parsed.data.objectId === objectId)
        listener(parsed.data.channel, parsed.data.data);
    };
    ipcRenderer.on(objectStreamChannel, handler);
    return () => ipcRenderer.removeListener(objectStreamChannel, handler);
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
