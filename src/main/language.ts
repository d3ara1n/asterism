import { app, ipcMain, type BrowserWindow } from "electron";
import Store from "electron-store";

import { applicationStorage, preferenceVersion } from "../shared/application.ts";
import { settingsReady } from "./settings-state.ts";
import { resolveLanguage } from "../shared/i18n.ts";
import {
  languageGetChannel, languageSetChannel, languageChangedChannel,
  languagePreferenceSchema, type LanguageState,
} from "../shared/language.ts";

let store: Store<{ version: number; preference: string }> | null = null;

export function readLanguage(): LanguageState {
  let preference = "system";
  if (!settingsReady()) return { preference, ...resolveLanguage(preference, app.getPreferredSystemLanguages()) };
  try {
    store ??= new Store<{ version: number; preference: string }>({
      cwd: app.getPath("userData"),
      name: applicationStorage.languageStore,
      defaults: { version: preferenceVersion, preference: "system" },
    });
    const parsed = languagePreferenceSchema.safeParse(store.get("preference"));
    if (parsed.success) preference = parsed.data;
  } catch {
    console.error("Language settings could not be read.");
  }
  return { preference, ...resolveLanguage(preference, app.getPreferredSystemLanguages()) };
}

export function serveLanguage(window: BrowserWindow, trusted: (event: Electron.IpcMainInvokeEvent) => boolean): () => void {
  ipcMain.removeHandler(languageGetChannel);
  ipcMain.removeHandler(languageSetChannel);
  const refresh = () => {
    if (!window.isDestroyed()) window.webContents.send(languageChangedChannel, readLanguage());
  };
  ipcMain.handle(languageGetChannel, event => trusted(event) ? readLanguage() : null);
  ipcMain.handle(languageSetChannel, (event, raw) => {
    if (!trusted(event) || !settingsReady()) return null;
    const parsed = languagePreferenceSchema.safeParse(raw);
    if (parsed.success) {
      readLanguage();
      store?.set("preference", parsed.data);
    }
    refresh();
    return readLanguage();
  });
  app.on("activate", refresh);
  window.on("focus", refresh);
  return () => {
    ipcMain.removeHandler(languageGetChannel);
    ipcMain.removeHandler(languageSetChannel);
    app.off("activate", refresh);
    window.off("focus", refresh);
  };
}
