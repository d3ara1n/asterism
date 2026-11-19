import { useEffect } from "react";
import type { UiText } from "@asterism-app/sdk/contracts";
import { startupMessages } from "../../shared/error-display";
import { getI18n } from "../shared/i18n";

/** During cold start the window stays hidden until this point in page time unless the interface is ready earlier, so quick starts present the finished interface directly. */
const REVEAL_DELAY_MS = 500;
/** After a delayed reveal, the mark stays at least this long so a start that finishes just after the reveal does not show it for only a few frames. */
const MINIMUM_VISIBLE_MS = 400;
/** A label appears only after its value has stayed current this long; ordinary startups pass through stages too quickly to read, so they show the mark alone. */
const LABEL_HOLD_MS = 1500;

export interface StartupSplash {
  stage(stage: UiText, detail?: string): void;
  /** Show the window with the splash now instead of after the reveal delay. */
  reveal(): void;
  /** Hand over to content already committed under the splash: cross-fade when the window is visible, otherwise remove the splash before showing the window. */
  handoff(): void;
}

/** A label line that reveals a value only after it stays unchanged; a change hides the line until the new value holds. */
function heldLabel(element: HTMLElement) {
  let current: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    set(key: string, text: () => string) {
      if (key === current) return;
      current = key;
      clearTimeout(timer);
      delete element.dataset.visible;
      if (!key) return;
      timer = setTimeout(() => { element.textContent = text(); element.dataset.visible = ""; }, LABEL_HOLD_MS);
    },
    stop() { clearTimeout(timer); },
  };
}

/**
 * Controls the static startup layer in index.html, which covers #root from the first frame and does not depend on React.
 * Stage changes never alter the mark; labels appear only for a stage or detail that stays current.
 */
export function startupSplash(element: HTMLElement): StartupSplash {
  const root = document.documentElement;
  const status = element.querySelector<HTMLElement>(".startup-status")!;
  const stageLabel = heldLabel(element.querySelector<HTMLElement>(".startup-stage-text")!);
  const detailLabel = heldLabel(element.querySelector<HTMLElement>(".startup-stage-detail")!);
  let shownAt: number | null = null, finished = false, minimum = MINIMUM_VISIBLE_MS;
  const show = () => { shownAt = performance.now(); window.host.window.show(); };
  const revealTimer = setTimeout(show, Math.max(0, REVEAL_DELAY_MS - performance.now()));
  const leave = () => {
    element.addEventListener("transitionend", event => {
      if (event.target !== element) return;
      element.remove();
      delete root.dataset.startup;
    });
    root.dataset.startup = "leaving";
  };
  return {
    reveal() {
      if (finished || shownAt !== null) return;
      clearTimeout(revealTimer);
      // An immediate reveal favors reaching the interface over a longer look at the mark.
      minimum = 0;
      show();
    },
    stage(stage, detail) {
      if (finished) return;
      // Assistive technology hears one stable status; slow stages add their label to the polite live region.
      const starting = getI18n().text(startupMessages.starting);
      if (status.textContent !== starting) status.textContent = starting;
      stageLabel.set(typeof stage === "string" ? stage : stage.id, () => getI18n().text(stage));
      detailLabel.set(detail ?? "", () => detail ?? "");
    },
    handoff() {
      if (finished) return;
      finished = true;
      stageLabel.stop(); detailLabel.stop();
      if (shownAt !== null) {
        setTimeout(leave, Math.max(0, shownAt + minimum - performance.now()));
        return;
      }
      clearTimeout(revealTimer);
      element.remove();
      delete root.dataset.startup;
      // Show only after a frame without the splash has been painted, so the window's first visible frame is the content.
      requestAnimationFrame(() => requestAnimationFrame(show));
    },
  };
}

/** Runs after React commits the tree it belongs to; StrictMode's repeated effect is absorbed by the idempotent callee. */
export function AfterCommit({ run }: { run: () => void }) {
  useEffect(() => { run(); }, [run]);
  return null;
}
