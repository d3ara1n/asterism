import { nativeTheme, type BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import { release } from "node:os";
import { windowGeometry } from "../shared/desktop.ts";
import { themeTokens } from "../shared/theme.ts";
import { readAppearance } from "./appearance.ts";

/** 实色回退取当前主题背景，与工作台底色一致。 */
const fallback = () => themeTokens(readAppearance()).background!;

/** 使用系统材质，不开启会改变缩放/阴影行为的 transparent 窗口模式。 */
export function initialWindowAppearance(): BrowserWindowConstructorOptions {
  const fallbackColor = fallback();
  const allowMaterial = !nativeTheme.prefersReducedTransparency && !nativeTheme.shouldUseHighContrastColors;
  if (process.platform === "darwin") {
    return {
      titleBarStyle: "hidden",
      trafficLightPosition: { ...windowGeometry.macControlsPosition },
      titleBarOverlay: {
        height: 2 * windowGeometry.gutter + windowGeometry.headerHeight,
      },
      backgroundColor: allowMaterial ? "#00000000" : fallbackColor,
      ...(allowMaterial ? { vibrancy: "under-window" as const, visualEffectState: "followWindow" as const } : {}),
    };
  }
  if (process.platform === "win32") {
    const [major = 0, , build = 0] = release().split(".").map(Number);
    const supported = major > 10 || (major === 10 && build >= 22621);
    const material = allowMaterial && supported;
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#00000000",
        symbolColor: material && nativeTheme.shouldUseDarkColors ? "#ffffff" : themeTokens(readAppearance()).foreground!,
        height: windowGeometry.gutter + windowGeometry.headerHeight,
      },
      backgroundColor: material ? "#00000000" : fallbackColor,
      ...(supported ? { backgroundMaterial: material ? "acrylic" as const : "none" as const } : {}),
    };
  }
  return { backgroundColor: fallbackColor };
}

/** 监听系统偏好；减少透明度与高对比度时切回实色，关闭窗口后释放监听。 */
export function followWindowAppearance(window: BrowserWindow): () => void {
  const update = () => {
    if (window.isDestroyed()) return;
    const options = initialWindowAppearance();
    window.setBackgroundColor(options.backgroundColor!);
    if (process.platform === "darwin") {
      window.setVibrancy(options.vibrancy === "under-window" ? "under-window" : null);
    }
    if (process.platform === "win32") {
      if (options.backgroundMaterial) window.setBackgroundMaterial(options.backgroundMaterial);
      if (typeof options.titleBarOverlay === "object") window.setTitleBarOverlay(options.titleBarOverlay);
    }
  };
  nativeTheme.on("updated", update);
  window.once("closed", () => nativeTheme.removeListener("updated", update));
  return update;
}
