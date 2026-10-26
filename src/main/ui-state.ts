import Store from "electron-store";
import { app, ipcMain } from "electron";
import { applicationStorage } from "../shared/application.ts";
import { persistentStateReady } from "./persistent-state.ts";
import { parseUiState, preferencesGetChannel, preferencesSetChannel, preferenceWriteSchema, type UiState, type UiStateKey } from "../shared/ui-state.ts";

/** 界面状态统一存于 userData 下的 ui-state.json；electron-store 负责原子写入。 */
let store: Store<Partial<UiState>> | null = null;
function open(): Store<Partial<UiState>> {
  store ??= new Store<Partial<UiState>>({ cwd: app.getPath("userData"), name: applicationStorage.uiStateStore });
  return store;
}

export function readUiState<K extends UiStateKey>(key: K): UiState[K] {
  if (!persistentStateReady()) return parseUiState(key, undefined);
  try { return parseUiState(key, open().get(key)); }
  catch (error) { console.error(`UI state "${key}" could not be read.`, error); return parseUiState(key, undefined); }
}

export function writeUiState<K extends UiStateKey>(key: K, value: UiState[K]): void {
  if (!persistentStateReady()) return;
  try { open().set(key, value); }
  catch (error) { console.error(`UI state "${key}" could not be saved.`, error); }
}

/**
 * renderer 只能经此读写 preferences 容器内的键；其他界面状态键不开放。
 * 读取一次返回整个容器，写入按单键替换，null 表示删除。返回注销函数。
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
