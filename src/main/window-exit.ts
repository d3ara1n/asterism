import { systemPreferences, type BrowserWindow } from "electron";

const fadeMs = 160;
const frameMs = 16;

/**
 * Take the window off screen before shutdown work so quitting responds immediately.
 * Fades where the platform applies window opacity and motion is welcome, then hides.
 * Returns whether the window was hidden, so a failed shutdown knows to bring it back.
 */
export async function dismissWindow(window: BrowserWindow): Promise<boolean> {
  if (window.isDestroyed() || !window.isVisible()) return false;
  // Linux ignores window opacity, so a fade there would only delay hiding.
  if (process.platform !== "linux" && !systemPreferences.getAnimationSettings().prefersReducedMotion) {
    const started = Date.now();
    await new Promise<void>(resolve => {
      const step = () => {
        if (window.isDestroyed()) { resolve(); return; }
        const progress = Math.min(1, (Date.now() - started) / fadeMs);
        window.setOpacity((1 - progress) ** 2);
        if (progress < 1) setTimeout(step, frameMs); else resolve();
      };
      step();
    });
  }
  if (window.isDestroyed()) return false;
  window.hide();
  return true;
}

/** Bring a dismissed window back when shutdown does not complete. */
export function restoreWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  window.setOpacity(1);
  window.show();
}
