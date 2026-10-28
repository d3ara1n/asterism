import { minimumFocusWidth } from "../../../shared/workbench";
import type { IslandWidth } from "../../shared/weave/model";
import type { WorkbenchEnvironment } from "./context";

/**
 * Focus: at most one object's content per session moves from its card into the focus island on the left of the workbench.
 * Focus identity and the island width are session layout state; the snapshot projects focus as null once the object leaves the current projection.
 */

/** Fixed identity of the focus island; retain the island when switching sessions and change only its content. */
export const focusIslandId = "focus";

/** Medium preset width; size presets scale it. */
export const focusMediumWidth = 720;

/** A fixed width holds regardless of the window and may overflow into strip scrolling; without one, the island shares the screen with the main view. */
export function focusIslandWidth(width: number | null): IslandWidth {
  return width === null ? { min: minimumFocusWidth, grow: 1.5 } : { min: width, max: width };
}

type Run = WorkbenchEnvironment["run"];

/** Object whose focus the user just requested; its content claims it once mounted to move keyboard focus into the island. */
let requested: string | null = null;

/** Move keyboard focus into the focus island when its content mounts for a user request, so the overflow viewport follows it. */
export function claimFocusRequest(objectId: string): boolean {
  if (requested !== objectId) return false;
  requested = null;
  return true;
}

export function focusIslandElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-island="${focusIslandId}"]`);
}

export async function enterFocus(run: Run, sessionId: string, objectId: string): Promise<void> {
  requested = objectId;
  if (!await run({ type: "focus.set", sessionId, objectId }) && requested === objectId) requested = null;
}

/** When focus ends, return keyboard focus to the card's focus toggle; if the card is hidden, return it to the workbench island. */
export async function exitFocus(run: Run, sessionId: string, objectId: string): Promise<void> {
  if (!await run({ type: "focus.set", sessionId, objectId: null })) return;
  requestAnimationFrame(() => {
    const toggle = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(objectId)}"] [data-object-focus]`);
    (toggle ?? document.querySelector<HTMLElement>(`[data-island="main-view"]`))?.focus({ preventScroll: true });
  });
}

export function setFocusWidth(run: Run, sessionId: string, width: number | null): Promise<boolean> {
  return run({ type: "focus.set", sessionId, width });
}
