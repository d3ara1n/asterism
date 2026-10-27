import type { Point } from "./workbench.ts";

/** Default dimensions and minimum scale when modules register no card views. */
export const fallbackCardWidth = 340;
export const fallbackCardHeight = 200;
export const minimumCardWidth = 280;
export const minimumCardHeight = 160;
/** Early objects without view rows default to visible; save positions on the user's first move. */
export const defaultCardPosition: Point = { x: 48, y: 48 };
/** Horizontal and vertical spacing between adjacent cards. */
export const placementGap = { x: 80, y: 80 };
