import { screen, type BrowserWindow, type Rectangle } from "electron";
import { readUiState, writeUiState } from "./ui-state.ts";

/**
 * Remember window position and size in the UI state's window key; fall back to defaults on corruption.
 * Center on the primary display if the saved position is off all displays, such as after disconnecting an external display.
 */
const minimum = { width: 800, height: 600 };
const maximum = { width: 1440, height: 960 };

/** Default to about 80% of the primary work area, capped at 1440×960 and centered. */
function defaultBounds(): Rectangle {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.max(minimum.width, Math.min(maximum.width, Math.round(area.width * 0.8)));
  const height = Math.max(minimum.height, Math.min(maximum.height, Math.round(area.height * 0.8)));
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height };
}

/** A window is visible only if part of it intersects a display work area and its title area is reachable. */
function visible(bounds: Rectangle): boolean {
  const area = screen.getDisplayMatching(bounds).workArea;
  const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
  const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
  return overlapX >= 100 && overlapY >= 50 && bounds.y >= area.y - 10;
}

export function initialWindowState(): { bounds: Rectangle; maximized: boolean; minWidth: number; minHeight: number } {
  const raw = readUiState("window");
  const saved = raw && raw.width >= minimum.width && raw.height >= minimum.height ? raw : null;
  const { maximized = false, ...bounds } = saved ?? {};
  return {
    bounds: saved && visible(bounds as Rectangle) ? bounds as Rectangle : defaultBounds(),
    maximized, minWidth: minimum.width, minHeight: minimum.height,
  };
}

/** Save after move/resize and on close; when maximized or fullscreen, retain normal bounds and record only the maximized flag. */
export function trackWindowState(window: BrowserWindow): void {
  const save = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    const maximized = window.isMaximized();
    const bounds = maximized ? window.getNormalBounds() : window.getBounds();
    writeUiState("window", { ...bounds, maximized });
  };
  let timer: NodeJS.Timeout | undefined;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(save, 400); };
  window.on("resize", debounced);
  window.on("move", debounced);
  window.on("maximize", save);
  window.on("unmaximize", save);
  window.on("close", () => { clearTimeout(timer); save(); });
}
