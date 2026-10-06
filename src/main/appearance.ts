import Store from "electron-store";
import { ipcMain, nativeTheme, type BrowserWindow } from "electron";
import {
  appearanceChangedChannel, appearanceGetChannel, appearancePatchSchema, appearanceSetChannel,
  defaultAppearance, parseAppearance, type Appearance,
} from "../shared/theme.ts";

/**
 * 外观设置：electron-store 负责原子写入，文件位于 userData（平台用户数据目录）下的 appearance.json。
 * 校验只走 Zod；损坏或未知字段逐项回退为默认值。
 */
let store: Store<{ appearance: Appearance }> | null = null;
function open(): Store<{ appearance: Appearance }> {
  store ??= new Store<{ appearance: Appearance }>({ name: "appearance", defaults: { appearance: defaultAppearance }, clearInvalidConfig: true });
  return store;
}

/** 同步读取，供创建窗口前决定实色回退色。 */
/** 三态模式交给 nativeTheme：系统材质与 renderer 的 prefers-color-scheme 同源。 */
export function applyThemeSource(appearance: Appearance = readAppearance()): void {
  nativeTheme.themeSource = appearance.mode;
}

export function readAppearance(): Appearance {
  try { return parseAppearance(open().get("appearance")); }
  catch (error) { console.error("Appearance settings could not be read.", error); return defaultAppearance; }
}

/** 注册 IPC；仅接受来自受信主框架的请求。返回注销函数。 */
export function serveAppearance(window: BrowserWindow, trusted: (event: Electron.IpcMainInvokeEvent) => boolean, onChange: (appearance: Appearance) => void): () => void {
  ipcMain.removeHandler(appearanceGetChannel);
  ipcMain.removeHandler(appearanceSetChannel);
  ipcMain.handle(appearanceGetChannel, event => trusted(event) ? readAppearance() : null);
  ipcMain.handle(appearanceSetChannel, (event, raw) => {
    if (!trusted(event)) return null;
    const patch = appearancePatchSchema.safeParse(raw);
    if (!patch.success) return readAppearance();
    const next = parseAppearance({ ...readAppearance(), ...patch.data });
    open().set("appearance", next);
    applyThemeSource(next);
    onChange(next);
    if (!window.isDestroyed()) window.webContents.send(appearanceChangedChannel, next);
    return next;
  });
  return () => { ipcMain.removeHandler(appearanceGetChannel); ipcMain.removeHandler(appearanceSetChannel); };
}
