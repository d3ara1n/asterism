import { ipcMain, type BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import { desktopWindowChangedChannel, desktopWindowGetChannel, windowGeometry, type DesktopWindowState, type TitleBarMode } from "../shared/desktop.ts";

/** 标题栏模式在创建窗口时固定；Linux 可显式交回桌面环境装饰。 */
export function titleBarMode(platform = process.platform, nativeTitleBar = process.argv.includes("--native-titlebar")): TitleBarMode {
  if (platform === "darwin") return "macos";
  if (platform === "win32" || (platform === "linux" && !nativeTitleBar)) return "overlay";
  return "native";
}

export function initialTitleBar(mode: TitleBarMode): BrowserWindowConstructorOptions {
  if (mode === "native") return {};
  if (mode === "macos") return {
    titleBarStyle: "hidden",
    trafficLightPosition: { ...windowGeometry.macControlsPosition },
    titleBarOverlay: { height: 2 * windowGeometry.gutter + windowGeometry.headerHeight },
  };
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: { height: windowGeometry.gutter + windowGeometry.headerHeight },
  };
}

/** 原生全屏事件是窗口状态真值；读取入口供首次加载与全屏内刷新使用。 */
export function serveDesktopWindow(
  window: BrowserWindow,
  mode: TitleBarMode,
  trusted: (event: Electron.IpcMainInvokeEvent) => boolean,
): () => void {
  const read = (): DesktopWindowState => ({ titleBar: mode, fullScreen: window.isFullScreen() });
  const publish = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send(desktopWindowChangedChannel, read());
  };
  ipcMain.removeHandler(desktopWindowGetChannel);
  ipcMain.handle(desktopWindowGetChannel, event => trusted(event) ? read() : null);
  window.on("enter-full-screen", publish);
  window.on("leave-full-screen", publish);
  return () => {
    ipcMain.removeHandler(desktopWindowGetChannel);
    window.removeListener("enter-full-screen", publish);
    window.removeListener("leave-full-screen", publish);
  };
}
