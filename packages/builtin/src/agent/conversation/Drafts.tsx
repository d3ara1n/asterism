import { useId, useState, useRef, useSyncExternalStore, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type MotionProps } from "motion/react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { displayInputParts, inputFileName } from "@asterism-app/builtin-api/contracts";
import {
  GripVertical, Inbox, ChevronDown, Paperclip,
  ArrowDownToLine, ArrowLeftRight, Trash2, MoreHorizontal,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@asterism-app/ui/ui/tooltip";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuItem, DropdownMenuGroup,
} from "@asterism-app/ui/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@asterism-app/ui/ui/alert-dialog";
import { StatusText } from "@asterism-app/ui/ui/status";
import { cn } from "@asterism-app/ui/utils";
import { conversationMessages as messages } from "../../messages/conversation";
import { useConversationInteraction } from "./interaction";
import { conversationEase, conversationTransition, immediateTransition } from "./motion";
import { commonMessages } from "@asterism-app/ui/messages/common";
import type { AgentDraft, DraftMode } from "../drafts-contract";
import { messageAppearance, messageSenderLabel } from "../message-presentation";

/** Draft box panel; mounted while items or an unconfirmed exchange exist, and folds away as one motion when the last item leaves. */
export function AgentDraftsPanel({ onTake }: { onTake(): void }) {
  const interaction = useConversationInteraction();
  // Folding is a panel preference, so it survives the box emptying and refilling.
  const [open, setOpen] = useState(true);
  const visible = interaction.drafts.length > 0 || interaction.pendingTake;
  // A leaving box keeps the props of its last present render, so the header still describes the item that is leaving.
  return <AnimatePresence initial={false}>
    {visible && <DraftsBox key="drafts" drafts={interaction.drafts} pendingTake={interaction.pendingTake}
      open={open} onOpenChange={setOpen} onTake={onTake} />}
  </AnimatePresence>;
}

type DraftIntent = "take" | "discard";
/** How a row leaves: retrieval goes down into the editor, delivery goes up into the conversation, discard dissolves in place. */
type DraftDeparture = DraftIntent | "send";
/** Exchange keeps the item id and replaces its content; the signature distinguishes a swapped row from the content an intent was recorded for. */
const draftSignature = (item: AgentDraft) => JSON.stringify([item.sender, item.parts]);

function boxMotion(reducedMotion: boolean): MotionProps {
  if (reducedMotion) return { initial: { height: 0, opacity: 0 }, animate: { height: "auto", opacity: 1 }, exit: { height: 0, opacity: 0 }, transition: immediateTransition };
  return {
    initial: { height: 0, opacity: 0 },
    animate: { height: "auto", opacity: 1, transition: {
      height: { duration: 0.2, ease: conversationEase }, opacity: { duration: 0.16, delay: 0.04, ease: conversationEase },
    } },
    // The last row departs first; the box folds behind it.
    exit: { height: 0, opacity: 0, transition: {
      height: { duration: 0.2, delay: 0.1, ease: conversationEase }, opacity: { duration: 0.16, delay: 0.12, ease: "easeIn" },
    } },
  };
}

function rowMotion(item: AgentDraft, departure: DraftDeparture, reducedMotion: boolean): MotionProps {
  if (reducedMotion) return { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: immediateTransition };
  // Rows saved from the editor rise from it; rows from agents and events arrive from the conversation above.
  const from = item.sender.kind === "user" ? 8 : -8;
  const to = { take: 10, send: -10, discard: 0 }[departure];
  return {
    initial: { opacity: 0, height: 0, y: from },
    animate: { opacity: 1, height: "auto", y: 0, scale: 1, transition: {
      height: { duration: 0.18, ease: conversationEase },
      opacity: { duration: 0.16, delay: 0.06, ease: conversationEase },
      y: { duration: 0.2, delay: 0.06, ease: conversationEase },
    } },
    // The row leaves first; the space it held closes behind it.
    exit: { opacity: 0, y: to, scale: departure === "discard" ? 0.96 : 1, height: 0, transition: {
      opacity: { duration: 0.14, ease: "easeIn" },
      y: { duration: 0.16, ease: "easeIn" },
      scale: { duration: 0.16, ease: "easeIn" },
      height: { duration: 0.18, delay: 0.1, ease: conversationEase },
    } },
  };
}

function DraftsBox({ drafts: current, pendingTake, open, onOpenChange, onTake }: {
  drafts: readonly AgentDraft[]; pendingTake: boolean; open: boolean; onOpenChange(open: boolean): void; onTake(): void;
}) {
  const i18n = useI18n();
  const interaction = useConversationInteraction();
  const present = useIsPresent();
  const reducedMotion = useReducedMotion() === true;
  const transition = reducedMotion ? immediateTransition : conversationTransition;
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggingId = useRef<string | null>(null);
  const contentId = useId();
  // A leaving box empties its list so the last row plays its own departure while the box folds.
  const drafts = present ? current : [];

  // Summary: counts by mode, showing only nonzero entries
  const counts = { follow: 0, steer: 0, none: 0 };
  for (const d of current) counts[d.mode]++;
  const summaryParts: string[] = [];
  if (counts.follow) summaryParts.push(i18n.formatMessage(messages.draftSummaryFollow, { count: counts.follow }));
  if (counts.steer) summaryParts.push(i18n.formatMessage(messages.draftSummarySteer, { count: counts.steer }));
  if (counts.none) summaryParts.push(i18n.formatMessage(messages.draftSummaryNone, { count: counts.none }));

  // Drag handling
  const onDragStart = (e: DragEvent, id: string) => {
    draggingId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };
  const onDrop = (e: DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const id = draggingId.current;
    draggingId.current = null;
    if (!id) return;
    const srcIndex = drafts.findIndex(d => d.id === id);
    if (srcIndex < 0 || srcIndex === targetIndex) return;
    const beforeItem = drafts[srcIndex < targetIndex ? targetIndex + 1 : targetIndex];
    void interaction.move(drafts[srcIndex]!, beforeItem?.id ?? null);
  };
  const onDragEnd = () => { draggingId.current = null; setDragOverIndex(null); };

  return (
    // Content is bottom-anchored, so the box rises out of the editor and folds back into it.
    <motion.div className="flex shrink-0 flex-col justify-end overflow-hidden" inert={!present} {...boxMotion(reducedMotion)}>
      <div className="shrink-0 border-t px-3 pb-1" aria-label={i18n.text(messages.drafts)}>

        {/* Handle / title row */}
        <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => onOpenChange(!open)}
          className="flex w-full items-center gap-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          <Inbox aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="type-label shrink-0">{i18n.text(messages.drafts)}</span>
          <Badge variant="secondary" className="h-4 min-w-4 shrink-0 px-1 tabular-nums">{current.length}</Badge>
          {summaryParts.length > 0 && (
            <span className="type-caption min-w-0 flex-1 truncate text-left">{summaryParts.join(" · ")}</span>
          )}
          {pendingTake && !open && (
            <AlertTriangle aria-hidden className="size-3 shrink-0 text-warning" />
          )}
          <ChevronDown aria-hidden className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ml-auto",
            !open && "rotate-180",
          )} />
        </button>

        <AnimatePresence initial={false}>
          {open && <motion.div key="drafts-content" id={contentId} className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}>
            {/* Exchange awaiting confirmation notice */}
            <AnimatePresence initial={false}>
              {pendingTake && <motion.div key="pending-take"
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }} transition={transition}
                className="mb-1 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-2 py-1">
                <StatusText tone="warning" className="min-w-0 flex-1">
                  {i18n.text(messages.draftExchangePending)}
                </StatusText>
                <Button type="button" size="xs" variant="outline"
                  disabled={!interaction.canRetryTake}
                  onClick={async () => { if (await interaction.retryTake()) onTake(); }}>
                  {i18n.text(messages.retryTake)}
                </Button>
              </motion.div>}
            </AnimatePresence>

            {/* Item list; row spacing lives inside each clipped wrapper so a collapsing row ends at zero height */}
            <div className="max-h-[min(12rem,35cqh)] overflow-y-auto py-0.5"
              role="list">
              <AnimatePresence initial={false}>
                {drafts.map((item, index) => (
                  <AnimatedDraftRow
                    key={item.id}
                    item={item}
                    index={index}
                    total={drafts.length}
                    isDragOver={dragOverIndex === index}
                    reducedMotion={reducedMotion}
                    onTake={onTake}
                    onDragStart={e => onDragStart(e, item.id)}
                    onDragOver={e => onDragOver(e, index)}
                    onDrop={e => onDrop(e, index)}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/** Exchange replaces a row's content in place: the old content turns away and the new content turns in. */
function DraftContentSwap({ swapKey, reducedMotion, children }: { swapKey: string; reducedMotion: boolean; children: ReactNode }) {
  return <span className="relative flex min-w-0 flex-1 items-center [perspective:400px]">
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span key={swapKey} className="flex min-w-0 flex-1 items-center gap-1.5"
        initial={{ opacity: 0, rotateX: -80 }} animate={{ opacity: 1, rotateX: 0 }} exit={{ opacity: 0, rotateX: 80 }}
        transition={reducedMotion ? immediateTransition : { duration: 0.22, ease: conversationEase }}>
        {children}
      </motion.span>
    </AnimatePresence>
  </span>;
}

// ─── Single draft row ────────────────────────────────────────────────────────────────

type DraftRowProps = {
  item: AgentDraft; index: number; total: number; isDragOver: boolean; reducedMotion: boolean;
  onTake(): void;
  /** Records how this row is about to leave; the returned function withdraws it when the operation fails. */
  onIntent(kind: DraftIntent): () => void;
  onDragStart(e: DragEvent): void;
  onDragOver(e: DragEvent): void;
  onDrop(e: DragEvent): void;
  onDragEnd(): void;
};

/** Departure intent lives with the row through its exit, then unmounts with it instead of accumulating in the box. */
function AnimatedDraftRow(props: Omit<DraftRowProps, "onIntent">) {
  const signature = draftSignature(props.item);
  const [intent, setIntent] = useState<{ kind: DraftIntent; signature: string } | null>(null);
  // An exchange keeps the row identity but replaces its content; the old content's intent no longer applies.
  if (intent && intent.signature !== signature) setIntent(null);
  const onIntent = (kind: DraftIntent) => {
    setIntent({ kind, signature });
    return () => setIntent(current => current?.signature === signature ? null : current);
  };
  const departure = intent?.signature === signature ? intent.kind : "send";
  return <motion.div className="overflow-hidden" {...rowMotion(props.item, departure, props.reducedMotion)}>
    <div className="pb-0.5"><DraftRow {...props} onIntent={onIntent} /></div>
  </motion.div>;
}

function DraftRow({
  item, index, total, isDragOver, reducedMotion, onTake, onIntent,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: DraftRowProps) {
  const i18n = useI18n();
  const interaction = useConversationInteraction();
  const [modePending, setModePending] = useState(false);
  const [movePending, setMovePending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const gripRef = useRef<HTMLButtonElement>(null);

  const shown = displayInputParts(item);
  const text = shown.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n");
  const files = shown.filter(p => p.kind !== "text");
  const hasText = Boolean(text.trim());

  // Keyboard sorting (Alt+↑/↓ on grip)
  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.altKey) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    if (movePending) return;
    setMovePending(true);
    const drafts = interaction.drafts;
    const before = e.key === "ArrowUp"
      ? drafts[index - 1]?.id ?? null           // Move up: place at the previous item's position
      : drafts[index + 2]?.id ?? null;           // Move down: place at the position two items later
    // "Move up": before = the previous item's id (insert this item before it)
    // In practice: move up = before = drafts[index-1].id; move down = before = drafts[index+2]?.id ?? null
    void interaction.move(item, before).finally(() => {
      setMovePending(false);
      // Keep focus on grip (React rerenders after the move, requiring a brief delay)
      requestAnimationFrame(() => gripRef.current?.focus());
    });
  };

  const { Icon: SenderIcon, surface } = messageAppearance[item.sender.kind];
  const editorHasContent = useSyncExternalStore(interaction.draft.subscribe, () => {
    const state = interaction.draft.getSnapshot();
    return Boolean(state.text.trim() || state.files.length);
  });

  // Source marker
  const senderName = i18n.text(messageSenderLabel(item.sender));
  const senderChip = (
    <span title={senderName} className={cn("inline-flex max-w-[7rem] shrink-0 items-center gap-1 rounded-full px-1.5 text-[10px] font-medium leading-4",
      surface)}>
      <SenderIcon className="size-2.5 shrink-0" aria-hidden />
      <span className={item.sender.kind === "user" ? "sr-only" : "truncate"}>{senderName}</span>
    </span>
  );

  // Mode label text and styles
  const modeLabel = { none: messages.draftNone, steer: messages.draftSteer, follow: messages.draftFollow }[item.mode];
  // Steer lands within the running turn, so it carries the strongest tone; keep stays quiet.
  const modeTone = { none: "secondary" as const, steer: "default" as const, follow: "outline" as const }[item.mode];

  return (
    <>
      {isDragOver && (
        <div className="mx-1 h-0.5 rounded-full bg-primary" aria-hidden />
      )}
      <div
        role="listitem"
        className="group/draft flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/40"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Drag handle; zero width until the row is hovered or the handle is focused, so content starts at the row edge. The negative margin cancels the row gap while collapsed. */}
        <button
          ref={gripRef}
          type="button"
          draggable
          disabled={!interaction.editable || movePending}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onKeyDown={onGripKey}
          aria-label={`${i18n.text(messages.drafts)} ${index + 1} – Alt+↑/↓ ${i18n.text(messages.moveUp)}/${i18n.text(messages.moveDown)}`}
          className="-mr-1.5 flex w-0 shrink-0 cursor-grab touch-none items-center justify-center overflow-hidden rounded py-0.5 text-muted-foreground opacity-0 outline-none transition-[width,margin,opacity] duration-150 ease-out motion-reduce:transition-none group-hover/draft:mr-0 group-hover/draft:w-4 group-hover/draft:opacity-60 focus-visible:mr-0 focus-visible:w-4 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
        >
          <GripVertical aria-hidden className="size-3 shrink-0" />
        </button>

        {/* Source, preview, and attachments turn over together when an exchange replaces the content */}
        <DraftContentSwap swapKey={draftSignature(item)} reducedMotion={reducedMotion}>
          {senderChip}

          {/* Body preview (with preview Tooltip) */}
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span className="type-caption min-w-0 flex-1 cursor-default select-none truncate">
                {hasText ? text : files.length > 0
                  ? i18n.formatMessage(messages.draftFilesOnly, { count: files.length })
                  : "…"}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top" sideOffset={6}
              className="max-w-[min(22rem,calc(100vw-2rem))] space-y-1.5 text-left whitespace-pre-wrap break-words">
              {hasText && <p className="type-body">{text}</p>}
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {files.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 type-label text-foreground">
                      <Paperclip className="size-2.5 shrink-0" aria-hidden />
                      {inputFileName(f)}
                    </span>
                  ))}
                </div>
              )}
            </TooltipContent>
          </Tooltip>

          {/* Attachment count badge */}
          {files.length > 0 && (
            <span className="shrink-0 inline-flex items-center gap-0.5 type-label text-muted-foreground">
              <Paperclip className="size-2.5" aria-hidden />{files.length}
            </span>
          )}
        </DraftContentSwap>

        {/* Delivery timing badge + dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={!interaction.editable || modePending}
              aria-label={`${i18n.text(messages.draftMode)}: ${i18n.text(modeLabel)}`}
              className="shrink-0 inline-flex items-center gap-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <Badge variant={modeTone} className="h-4 px-1.5 text-[10px] gap-0.5 cursor-pointer">
                {i18n.text(modeLabel)}
                <ChevronDown className="size-2.5 text-inherit" aria-hidden />
              </Badge>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52">
            <DropdownMenuRadioGroup
              value={item.mode}
              onValueChange={async value => {
                if (modePending || value === item.mode) return;
                setModePending(true);
                await interaction.setMode(item, value as DraftMode);
                setModePending(false);
              }}>
              <ModeItem value="none" label={i18n.text(messages.draftNone)} hint={i18n.text(messages.draftNoneHint)} />
              <ModeItem value="steer" label={i18n.text(messages.draftSteer)} hint={i18n.text(messages.draftSteerHint)} />
              <ModeItem value="follow" label={i18n.text(messages.draftFollow)} hint={i18n.text(messages.draftFollowHint)} />
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Retrieve / exchange */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button" variant="ghost" size="icon-xs"
              disabled={!interaction.editable}
              aria-label={i18n.text(editorHasContent ? messages.exchangeDraft : messages.takeDraft)}
              onClick={async () => {
                const release = onIntent("take");
                if (await interaction.take(item)) onTake(); else release();
              }}>
              {editorHasContent ? <ArrowLeftRight aria-hidden /> : <ArrowDownToLine aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4} className="max-w-[14rem] space-y-0.5 text-left">
            <p>{i18n.text(editorHasContent ? messages.exchangeDraft : messages.takeDraftHint)}</p>
            {editorHasContent && <p className="type-caption">{i18n.text(messages.exchangeDraftHint)}</p>}
          </TooltipContent>
        </Tooltip>

        {/* More actions (move + discard) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs"
              disabled={!interaction.editable}
              aria-label={i18n.text(messages.draftMoreActions)}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-36">
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={index === 0 || movePending}
                onSelect={async () => {
                  if (movePending) return;
                  setMovePending(true);
                  const drafts = interaction.drafts;
                  await interaction.move(item, drafts[index - 1]!.id);
                  setMovePending(false);
                }}>
                {i18n.text(messages.moveUp)}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === total - 1 || movePending}
                onSelect={async () => {
                  if (movePending) return;
                  setMovePending(true);
                  const drafts = interaction.drafts;
                  await interaction.move(item, drafts[index + 2]?.id ?? null);
                  setMovePending(false);
                }}>
                {i18n.text(messages.moveDown)}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setConfirmDiscard(true)}>
              <Trash2 aria-hidden className="size-3.5" />
              {i18n.text(messages.discardDraft)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Discard confirmation dialog */}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18n.text(messages.discardDraftTitle)}</AlertDialogTitle>
            <AlertDialogDescription>
              {hasText
                ? <span className="line-clamp-3 break-words font-mono text-xs">{text}</span>
                : i18n.text(messages.discardDraftDescription)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18n.formatMessage(commonMessages.cancel)}</AlertDialogCancel>
            <AlertDialogAction variant="destructive"
              onClick={async e => {
                e.preventDefault();
                const release = onIntent("discard");
                const ok = await interaction.discard(item);
                if (ok) setConfirmDiscard(false); else release();
              }}>
              {i18n.text(messages.discardDraft)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Mode dropdown options ──────────────────────────────────────────────────────────────

function ModeItem({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <DropdownMenuRadioItem value={value} className="items-start gap-2 pr-2">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="mt-0.5 type-caption leading-snug">{hint}</p>
      </div>
    </DropdownMenuRadioItem>
  );
}
