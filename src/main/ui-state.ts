import Store from "electron-store";
import { app, ipcMain } from "electron";
import { applicationStorage } from "../shared/application.ts";
import { parseUiState, preferencesGetChannel, preferencesSetChannel, preferenceWriteSchema, type UiState, type UiStateKey } from "../shared/ui-state.ts";

/** UI state is centralized in ui-state.json under userData; it is a cache without migration or backup and resets on corruption. */
let store: Store<Partial<UiState>> | null = null;
function open(): Store<Partial<UiState>> {
  store ??= new Store<Partial<UiState>>({ cwd: app.getPath("userData"), name: applicationStorage.uiStateStore, clearInvalidConfig: true });
  return store;
}

export function readUiState<K extends UiStateKey>(key: K): UiState[K] {
  try { return parseUiState(key, open().get(key)); }
  catch (error) { console.error(`UI state "${key}" could not be read.`, error); return parseUiState(key, undefined); }
}

export function writeUiState<K extends UiStateKey>(key: K, value: UiState[K]): void {
  try { open().set(key, value); }
  catch (error) { console.error(`UI state "${key}" could not be saved.`, error); }
}

/**
 * The renderer can access only keys within the preferences container here; other UI state keys are not exposed.
 * Reads return the whole container; writes replace individual keys and null deletes them. Returns an unregister function.
 */
export function servePreferences(trusted: (event: Electron.IpcMainInvokeEvent) => boolean): () => void {
  ipcMain.removeHandler(preferencesGetChannel);
  ipcMain.removeHandler(preferencesSetChannel);
  ipcMain.handle(preferencesGetChannel, event => trusted(event) ? readUiState("preferences") : {});
  ipcMain.handle(preferencesSetChannel, (event, raw) => {
    if (!trusted(event)) return false;
    const write = preferenceWriteSchema.safeParse(raw);
    if (!write.success) return false;
    const next = { ...readUiState("preferences") };
    if (write.data.value === null) delete next[write.data.key];
    else next[write.data.key] = write.data.value;
    writeUiState("preferences", next);
    return true;
  });
  return () => { ipcMain.removeHandler(preferencesGetChannel); ipcMain.removeHandler(preferencesSetChannel); };
}
