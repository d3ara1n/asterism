import { nativeTheme, type BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import { release } from "node:os";
import type { TitleBarMode } from "../shared/desktop.ts";
import { themeTokens } from "../shared/theme.ts";
import { readAppearance } from "./appearance.ts";

/** Use the current theme background as the solid fallback to match the workbench. */
const scheme = () => nativeTheme.shouldUseDarkColors ? "dark" as const : "light" as const;
const tokens = () => themeTokens(readAppearance(), scheme());
const fallback = () => tokens().background!;

/** Use system materials without transparent window mode, which changes scaling and shadow behavior. */
export function initialWindowAppearance(): BrowserWindowConstructorOptions {
  const fallbackColor = fallback();
  const allowMaterial = !nativeTheme.prefersReducedTransparency && !nativeTheme.shouldUseHighContrastColors;
  if (process.platform === "darwin") {
    return {
      backgroundColor: allowMaterial ? "#00000000" : fallbackColor,
      ...(allowMaterial ? { vibrancy: "under-window" as const, visualEffectState: "followWindow" as const } : {}),
    };
  }
  if (process.platform === "win32") {
    const [major = 0, , build = 0] = release().split(".").map(Number);
    const supported = major > 10 || (major === 10 && build >= 22621);
    const material = allowMaterial && supported;
    return {
      backgroundColor: material ? "#00000000" : fallbackColor,
      ...(supported ? { backgroundMaterial: material ? "acrylic" as const : "none" as const } : {}),
    };
  }
  return { backgroundColor: fallbackColor };
}

/** Observe system preferences; use solid colors for reduced transparency or high contrast and release listeners after window close. */
export function followWindowAppearance(window: BrowserWindow, titleBar: TitleBarMode): () => void {
  const update = () => {
    if (window.isDestroyed()) return;
    const options = initialWindowAppearance();
    window.setBackgroundColor(options.backgroundColor!);
    if (process.platform === "darwin") {
      window.setVibrancy(options.vibrancy === "under-window" ? "under-window" : null);
    }
    if (process.platform === "win32") {
      if (options.backgroundMaterial) window.setBackgroundMaterial(options.backgroundMaterial);
    }
    if (titleBar === "overlay") window.setTitleBarOverlay({
      color: "#00000000",
      symbolColor: options.backgroundMaterial === "acrylic" && nativeTheme.shouldUseDarkColors ? "#ffffff" : tokens().foreground!,
    });
  };
  nativeTheme.on("updated", update);
  window.once("closed", () => nativeTheme.removeListener("updated", update));
  update();
  return update;
}
