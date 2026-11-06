import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { commonMessages } from "./messages/common";
import { Button } from "./ui/button";

/** Return control naming the current nested page. Pointer presses keep focus in the search input. */
export function CommandBack({ label, onBack }: { label: string; onBack(): void }) {
  const i18n = useI18n();
  return <div className="flex items-center px-2 pt-2">
    <Button type="button" variant="ghost" size="xs" className="text-muted-foreground hover:text-foreground"
      onMouseDown={event => event.preventDefault()} onClick={onBack}>
      <ChevronLeft /><span className="sr-only">{i18n.text(commonMessages.back)}</span>{label}
    </Button>
  </div>;
}

/** Backspace in an empty query returns to the parent page; IME composition keeps the key. */
export function isCommandBackKey(event: KeyboardEvent, search: string): boolean {
  return event.key === "Backspace" && !search && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229;
}

/** Plays a page entry on navigation without remounting, so state rendered inside the page survives.
 *  Deeper pages enter from the trailing edge and shallower pages from the leading edge; the first page relies on the surface's own entry. */
export function useCommandPageMotion<T extends HTMLElement>(page: string, depth: number): RefObject<T | null> {
  const ref = useRef<T>(null);
  const previous = useRef({ page, depth });
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = { page, depth };
    if (from.page === page || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current?.animate([
      { opacity: 0, transform: `translateX(${depth >= from.depth ? 10 : -10}px)` },
      { opacity: 1, transform: "none" },
    ], { duration: 160, easing: "cubic-bezier(0, 0, 0.2, 1)" });
  }, [page, depth]);
  return ref;
}
