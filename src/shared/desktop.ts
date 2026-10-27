/** Desktop window state and geometry, outside task history and runtime protocols. */
import { z } from "zod";
import { coreChannel } from "./core.ts";

export type DesktopPlatform = "darwin" | "win32" | "linux";

export const desktopWindowGetChannel = coreChannel("window.get");
export const desktopWindowChangedChannel = coreChannel("window.changed");
export const desktopWindowStateSchema = z.strictObject({
  titleBar: z.enum(["macos", "overlay", "native"]),
  fullScreen: z.boolean(),
});
export type DesktopWindowState = z.infer<typeof desktopWindowStateSchema>;
export type TitleBarMode = DesktopWindowState["titleBar"];
export interface DesktopWindowBridge {
  get(): Promise<DesktopWindowState>;
  onChanged(listener: (state: DesktopWindowState) => void): () => void;
}

// Native window buttons and renderer spacing share geometry parameters in DIP.
export const windowGeometry = {
  gutter: 6,
  gap: 6,
  headerHeight: 32,
  // Width of the traffic-light button group itself; horizontal padding is symmetric around the x coordinate.
  macControlsWidth: 52,
  // Native control visual positions in window client-area DIP, independent of default position offsets.
  macControlsPosition: { x: 20, y: 15 },
} as const;
