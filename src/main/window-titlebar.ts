import { ipcMain, type BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import { desktopWindowChangedChannel, desktopWindowGetChannel, windowGeometry, type DesktopWindowState, type TitleBarMode } from "../shared/desktop.ts";

/** Fix the titlebar mode at window creation; Linux can explicitly delegate decoration to the desktop environment. */
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

/** Native fullscreen events are the window-state authority; reads serve initial load and refresh within fullscreen. */
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
