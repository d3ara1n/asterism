import { screen, type BrowserWindow, type Rectangle } from "electron";
import { readUiState, writeUiState } from "./ui-state.ts";

/**
 * 窗口位置与尺寸记忆：存于界面状态的 window 键，损坏即回退默认。
 * 保存的位置不在任何显示器上（如外接屏已拔掉）时回退为主屏居中。
 */
const minimum = { width: 800, height: 600 };
const maximum = { width: 1440, height: 960 };

/** 默认尺寸取主屏工作区约 80%，上限 1440×960，居中。 */
function defaultBounds(): Rectangle {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.max(minimum.width, Math.min(maximum.width, Math.round(area.width * 0.8)));
  const height = Math.max(minimum.height, Math.min(maximum.height, Math.round(area.height * 0.8)));
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height };
}

/** 窗口至少有一块与某显示器工作区相交且标题区可达，才视为可见。 */
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

/** 移动/缩放结束与关闭时写入；最大化或全屏时保留常规尺寸，只记录最大化标记。 */
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
