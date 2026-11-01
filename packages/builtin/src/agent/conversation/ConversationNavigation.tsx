import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import type { VirtualizerHandle } from "virtua";
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from "motion/react";
import { TableOfContents } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { inputFileName } from "@asterism-app/builtin-api/contracts";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { Button } from "@asterism-app/ui/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@asterism-app/ui/ui/command";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { cn } from "@asterism-app/ui/utils";
import { conversationMessages } from "../../messages/conversation";
import { messageSenderLabel } from "../message-presentation";
import { conversationTransition, immediateTransition } from "./motion";
import type { TimelineItem } from "./timeline";
import { readingPosition } from "./navigation";

export interface ConversationNavigationHandle { update(): void }

/** Navigation lands inputs this far below the viewport top so the floating pill does not cover them. */
const readingInset = 32;
/** Longer outlines gain a search field. */
const searchThreshold = 8;
const previewLength = 600;
/** Frames to wait for a navigated input to mount before skipping the landing highlight. */
const landingAttempts = 8;

interface Chapter {
  id: string;
  /** Timeline index of the input item. */
  index: number;
  number: number;
  sender: string;
  /** Single-line text for the pill and outline rows. */
  summary: string;
  /** Multi-line text for the hover preview. */
  preview: string;
}

/** Content moving with the reading direction: later chapters enter from below, earlier ones from above. */
const swap: Variants = {
  enter: (direction: number) => ({ opacity: 0, y: 8 * direction }),
  center: { opacity: 1, y: 0 },
  exit: (direction: number) => ({ opacity: 0, y: -8 * direction }),
};

/**
 * Floating outline for input chapters. The pill's background fills with the reading position through the current input's replies,
 * shows the current input once it scrolls under the reading line, and its counter opens an outline of every loaded input.
 * Positions come from virtualizer measurements, so unmounted inputs are located too.
 */
export function ConversationNavigation({ timeline, scroll, list, onSelect, ref }: {
  timeline: readonly TimelineItem[];
  scroll: RefObject<HTMLDivElement | null>;
  list: RefObject<VirtualizerHandle | null>;
  onSelect(index: number, inset: number): void;
  ref?: Ref<ConversationNavigationHandle>;
}) {
  const i18n = useI18n();
  const reducedMotion = useReducedMotion() === true;
  const transition = reducedMotion ? immediateTransition : conversationTransition;
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [past, setPast] = useState(false);
  const [direction, setDirection] = useState(1);
  const [highlighted, setHighlighted] = useState("");
  const [titleWidth, setTitleWidth] = useState<number>();
  const fill = useRef<HTMLSpanElement>(null);
  const outline = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const lastChapter = useRef(-1);
  const landing = useRef(0);
  useEffect(() => () => cancelAnimationFrame(landing.current), []);

  const chapters = useMemo(() => {
    const result: Chapter[] = [];
    timeline.forEach((item, index) => {
      if (item.kind !== "message") return;
      const text = item.parts.filter(part => part.kind === "text").map(part => part.text).join("\n").trim();
      const content = text || item.parts.filter(part => part.kind !== "text").map(inputFileName).join("\n");
      const number = result.length + 1;
      result.push({
        id: item.id, index, number,
        sender: item.sender.kind === "user" ? "" : i18n.text(messageSenderLabel(item.sender)),
        summary: content.slice(0, previewLength).replace(/\s+/gu, " ").trim() || i18n.formatMessage(conversationMessages.inputNumber, { number }),
        preview: content.length > previewLength ? `${content.slice(0, previewLength)}…` : content,
      });
    });
    return result;
  }, [timeline, i18n]);

  const update = useCallback(() => {
    const element = scroll.current;
    const virtualizer = list.current;
    if (!element || !virtualizer || !chapters.length) return;
    const end = Math.max(0, element.scrollHeight - element.clientHeight);
    const position = readingPosition(chapters.map(chapter => virtualizer.getItemOffset(chapter.index)),
      element.scrollTop, end, readingInset);
    // Scroll progress writes the fill directly; React rerenders only when the chapter or its visibility changes.
    if (fill.current) fill.current.style.transform = `scaleX(${position.progress})`;
    if (position.chapter !== lastChapter.current) {
      if (lastChapter.current >= 0) setDirection(position.chapter > lastChapter.current ? 1 : -1);
      lastChapter.current = position.chapter;
    }
    setActiveId(chapters[position.chapter]!.id);
    setPast(position.past);
  }, [chapters, scroll, list]);
  // The owner of the scroll container forwards scroll and measurement events; this effect covers chapter changes.
  useImperativeHandle(ref, () => ({ update }), [update]);
  useLayoutEffect(update, [update]);

  // The landed input's bubble briefly rings so the eye finds it after the jump; it waits for the virtual list to mount the item.
  const highlightLanding = (id: string) => {
    cancelAnimationFrame(landing.current);
    const attempt = (remaining: number) => {
      const surface = scroll.current?.querySelector<HTMLElement>(`[data-conversation-message="${CSS.escape(id)}"] [data-message-surface]`);
      if (!surface) {
        if (remaining > 0) landing.current = requestAnimationFrame(() => attempt(remaining - 1));
        return;
      }
      const color = getComputedStyle(surface).getPropertyValue("--ring").trim() || "currentColor";
      surface.animate([
        { boxShadow: `0 0 0 2px ${color}` },
        { boxShadow: `0 0 0 ${reducedMotion ? 2 : 8}px transparent` },
      ], { duration: 900, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    };
    landing.current = requestAnimationFrame(() => attempt(landingAttempts));
  };

  const current = chapters.find(chapter => chapter.id === activeId) ?? chapters[0];
  if (!current) return null;
  const multiple = chapters.length > 1;
  const visible = multiple || past;
  const select = (chapter: Chapter) => {
    setOpen(false);
    onSelect(chapter.index, readingInset);
    highlightLanding(chapter.id);
  };
  const position = i18n.formatMessage(conversationMessages.outlinePosition, { current: current.number, total: chapters.length });
  const outlineLabel = i18n.text(conversationMessages.outline);
  const backLabel = i18n.text(conversationMessages.chapterStart);

  // Opening focuses the outline and centers the current input inside the outline's own viewport, without scrolling the conversation.
  const reveal = (event: Event) => {
    event.preventDefault();
    (search.current ?? outline.current)?.focus({ preventScroll: true });
    const container = outline.current;
    const item = container?.querySelector<HTMLElement>("[data-current]");
    if (!container || !item) return;
    const offset = item.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTop = offset - (container.clientHeight - item.offsetHeight) / 2;
  };

  return <div className="@container pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-4"
    inert={!visible} aria-hidden={!visible || undefined}>
    <Popover open={open} onOpenChange={next => { if (next) setHighlighted(current.id); setOpen(next); }}>
      <PopoverAnchor asChild>
        <div className={cn("surface-floating relative isolate flex min-w-0 max-w-full items-center overflow-hidden rounded-full p-0.5",
          "transition-[opacity,translate,scale] duration-(--motion-fast) ease-(--ease-out) motion-reduce:transition-none",
          visible ? "pointer-events-auto" : "-translate-y-1 scale-95 opacity-0")}>
          {/* Reading progress through the current input's replies; the transition smooths scroll steps and drains on chapter changes. */}
          <span ref={fill} aria-hidden="true" style={{ transform: "scaleX(0)" }}
            className="pointer-events-none absolute inset-0 -z-10 origin-left bg-linear-to-r from-foreground/2 to-foreground/10 transition-transform duration-(--motion-fast) ease-(--ease-out) motion-reduce:transition-none" />
          {multiple && <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-label={`${outlineLabel}: ${position}`}
              className="h-7 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground tabular-nums has-[>svg]:px-2.5">
              <TableOfContents />
              <span className="flex items-center">
                <span className="relative inline-flex overflow-hidden">
                  <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                    <motion.span key={current.number} custom={direction} variants={swap} initial="enter" animate="center" exit="exit"
                      transition={transition}>{current.number}</motion.span>
                  </AnimatePresence>
                </span>
                /{chapters.length}
              </span>
            </Button>
          </PopoverTrigger>}
          {/* Width animates through the grid track, so the pill grows from the counter into the title. */}
          <div className={cn("grid min-w-0 transition-[grid-template-columns,opacity] duration-(--motion-fast) ease-(--ease-out) motion-reduce:transition-none",
            past ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0")} inert={!past}>
            <div className="flex min-w-0 overflow-hidden">
              {multiple && <span aria-hidden="true" className="my-auto h-4 w-px shrink-0 bg-border" />}
              <TooltipProvider delayDuration={400}><Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" aria-label={`${backLabel}: ${current.summary.slice(0, 240)}`}
                    className="h-7 min-w-0 shrink rounded-full px-2.5 font-normal" onClick={() => select(current)}>
                    {/* Titles swap with the reading direction while the slot eases to the new title's width. */}
                    <motion.span className="relative flex h-full min-w-0 items-center overflow-hidden"
                      initial={false} animate={{ width: titleWidth ?? "auto" }} transition={transition}>
                      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                        <motion.span key={current.id} custom={direction} variants={swap} initial="enter" animate="center" exit="exit"
                          transition={transition} className="flex shrink-0">
                          <MeasuredTitle onWidth={setTitleWidth}>
                            {current.sender && <span className="shrink-0 text-muted-foreground">{current.sender}</span>}
                            <span className="min-w-0 truncate">{current.summary}</span>
                          </MeasuredTitle>
                        </motion.span>
                      </AnimatePresence>
                    </motion.span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6} collisionPadding={12} className="w-80 max-w-(--radix-tooltip-content-available-width) text-left text-wrap">
                  <p className="line-clamp-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{current.preview}</p>
                  <p className="mt-1 opacity-70">{backLabel}</p>
                </TooltipContent>
              </Tooltip></TooltipProvider>
            </div>
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent side="bottom" sideOffset={6} collisionPadding={12} aria-label={outlineLabel} onOpenAutoFocus={reveal}
        className="w-80 max-w-(--radix-popover-content-available-width) overflow-hidden p-0">
        <Command label={outlineLabel} value={highlighted} onValueChange={setHighlighted} loop
          filter={(_, query, keywords) => keywords?.join("\n").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? 1 : 0}>
          {chapters.length > searchThreshold && <CommandInput ref={search} placeholder={i18n.text(conversationMessages.outlineSearch)} />}
          <CommandList ref={outline} tabIndex={-1} label={outlineLabel}
            className="max-h-[min(24rem,calc(var(--radix-popover-content-available-height)-3rem))] overscroll-contain p-1 outline-hidden">
            <CommandEmpty>{i18n.text(commonMessages.noMatches)}</CommandEmpty>
            {chapters.map(chapter => {
              const isCurrent = chapter.id === current.id;
              return <CommandItem key={chapter.id} value={chapter.id} keywords={[chapter.sender, chapter.preview]}
                data-current={isCurrent ? "" : undefined} aria-current={isCurrent ? "location" : undefined}
                onSelect={() => select(chapter)}
                className="items-start gap-2.5 py-2 transition-colors duration-(--motion-fast) ease-(--ease-out) motion-reduce:transition-none">
                <span className={cn("w-5 shrink-0 pt-px text-right text-xs tabular-nums",
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground")}>{chapter.number}</span>
                <span className="min-w-0 flex-1">
                  {chapter.sender && <span className="type-label block">{chapter.sender}</span>}
                  <span className={cn("line-clamp-2 [overflow-wrap:anywhere]", isCurrent && "font-medium")}>{chapter.summary}</span>
                </span>
                <span aria-hidden="true" className={cn("mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/60", !isCurrent && "invisible")} />
              </CommandItem>;
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>;
}

/**
 * Reports the title's intrinsic width while it is the present title; exiting titles stop reporting.
 * `w-max` keeps the measurement independent of the animated slot width, and the cap leaves room for the counter on narrow cards.
 */
function MeasuredTitle({ onWidth, children }: { onWidth(width: number): void; children: ReactNode }) {
  const present = useIsPresent();
  const element = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node || !present) return;
    const observer = new ResizeObserver(([entry]) => {
      const size = entry?.borderBoxSize[0];
      if (size) onWidth(Math.ceil(size.inlineSize));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [present, onWidth]);
  return <span ref={element} className="flex w-max max-w-[min(18rem,calc(100cqw-9rem))] shrink-0 items-center gap-1.5">{children}</span>;
}
