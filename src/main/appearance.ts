import Store from "electron-store";
import { app, ipcMain, nativeTheme, type BrowserWindow } from "electron";
import { applicationStorage, preferenceVersion } from "../shared/application.ts";
import { settingsReady } from "./settings-state.ts";
import {
  appearanceChangedChannel, appearanceGetChannel, appearancePatchSchema, appearanceSetChannel,
  defaultAppearance, parseAppearance, type Appearance,
} from "../shared/theme.ts";

/**
 * Appearance settings: electron-store writes atomically to appearance.json under userData (the platform user data directory).
 * Startup prepares the file; Zod parses individual display values.
 */
type AppearanceStore = { version: number; appearance: Appearance };
let store: Store<AppearanceStore> | null = null;
const defaults = defaultAppearance(process.platform);
function open(): Store<AppearanceStore> {
  store ??= new Store<AppearanceStore>({ cwd: app.getPath("userData"), name: applicationStorage.appearanceStore, defaults: { version: preferenceVersion, appearance: defaults } });
  return store;
}

/** Delegate the three-state mode to nativeTheme so system materials and renderer prefers-color-scheme share one source. */
export function applyThemeSource(appearance: Appearance = readAppearance()): void {
  nativeTheme.themeSource = appearance.mode;
}

/** Read synchronously to determine the solid fallback color before window creation. */
export function readAppearance(): Appearance {
  if (!settingsReady()) return defaults;
  try { return parseAppearance(open().get("appearance"), process.platform); }
  catch (error) { console.error("Appearance settings could not be read.", error); return defaults; }
}

/** Register IPC accepting only trusted main-frame requests. Returns an unregister function. */
export function serveAppearance(window: BrowserWindow, trusted: (event: Electron.IpcMainInvokeEvent) => boolean, onChange: (appearance: Appearance) => void): () => void {
  ipcMain.removeHandler(appearanceGetChannel);
  ipcMain.removeHandler(appearanceSetChannel);
  ipcMain.handle(appearanceGetChannel, event => trusted(event) ? readAppearance() : null);
  ipcMain.handle(appearanceSetChannel, (event, raw) => {
    if (!trusted(event) || !settingsReady()) return null;
    const patch = appearancePatchSchema.safeParse(raw);
    if (!patch.success) return readAppearance();
    const next = parseAppearance({ ...readAppearance(), ...patch.data }, process.platform);
    open().set("appearance", next);
    applyThemeSource(next);
    onChange(next);
    if (!window.isDestroyed()) window.webContents.send(appearanceChangedChannel, next);
    return next;
  });
  return () => { ipcMain.removeHandler(appearanceGetChannel); ipcMain.removeHandler(appearanceSetChannel); };
}
