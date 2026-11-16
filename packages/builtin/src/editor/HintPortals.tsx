import { createPortal } from "react-dom";
import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import type { HintPortal } from "./hint-portals";

export function HintPortals({ portals }: { portals: HintPortal[] }) {
  return portals.map(hint => createPortal(<TooltipHint content={hint.label}>
    <span className={hint.className} aria-label={hint.ariaLabel ?? undefined}>{hint.text}</span>
  </TooltipHint>, hint.dom, String(hint.id)));
}
