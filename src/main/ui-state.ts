import Store from "electron-store";
import { app } from "electron";
import { applicationStorage } from "../shared/application.ts";
import { parseUiState, type UiState, type UiStateKey } from "../shared/ui-state.ts";

/** 界面状态统一存于 userData 下的 ui-state.json；electron-store 负责原子写入。 */
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
