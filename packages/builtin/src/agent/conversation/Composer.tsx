import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { useI18n, useRendererApplication } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Square, ArrowUp, Archive, Paperclip, FileType } from "lucide-react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode, type RefObject } from "react";
import { composerTextLimit, type MessageDraft } from "./draft";
import type { AgentExecutionState } from "../state";
import { AttachFiles, DraftFiles, fileInputEvents } from "./Files";
import { ComposerEditor, type ComposerEditorHandle } from "./composer-editor";
import { droppedPathText, isFileDrag } from "./file-drop";
import "./execution.css";
import { toast } from "sonner";
import { cn } from "@asterism-app/ui/utils";

import { Button } from "@asterism-app/ui/ui/button";
import { InputGroup, InputGroupAddon } from "@asterism-app/ui/ui/input-group";
import { commonMessages } from "../../messages/common";
import { conversationMessages } from "../../messages/conversation";
import { mediaMessages } from "../../messages/media";
import { conversationEase, conversationTransition, immediateTransition } from "./motion";

const fileDropTargets = [
  { id: "attach", label: mediaMessages.attach, Icon: Paperclip },
  { id: "paths", label: conversationMessages.insertPaths, Icon: FileType },
] as const;
type FileDropTarget = typeof fileDropTargets[number]["id"];

function dropTarget(target: EventTarget): FileDropTarget | null {
  const id = target instanceof Element && target.closest("[data-file-drop]")?.getAttribute("data-file-drop");
  return id === "attach" || id === "paths" ? id : null;
}

/**
 * The input tray: a shell holding the drafts box, the editor sheet and the toolbar lip, so everything that shapes the next
 * message reads as one object. The conversation places its execution indicator on the tray's top edge.
 * The tray does not clip: the reference menu opens above the editor and the execution tab stands above the edge.
 * The tray matches the card content corner rather than exceeding it; the wide footer gap keeps the two edges apart,
 * and the editor sheet nests concentrically inside the tray's padding and border.
 */
export function ComposerTray({ children }: { children: ReactNode }) {
  return <div className={cn("group/tray relative flex min-w-0 flex-col rounded-lg border bg-card-shell p-1 shadow-(--shadow-lift) transition-[border-color] duration-200",
    "has-[[data-slot=input-group-control]:focus]:border-ring")}>
    {children}
  </div>;
}

/** Send and stop share one round slot, so the action row keeps its width when execution starts or ends. */
function PrimaryActionSlot({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  const reducedMotion = useReducedMotion() === true;
  return <div className="relative size-8 shrink-0">
    <AnimatePresence initial={false}>
      <motion.div key={swapKey} className="absolute inset-0"
        initial={{ opacity: 0, scale: 0.6, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.6, rotate: 45 }}
        transition={reducedMotion ? immediateTransition : { duration: 0.2, ease: conversationEase }}>
        <LeavingInert>{children}</LeavingInert>
      </motion.div>
    </AnimatePresence>
  </div>;
}
/** A leaving action finishes its exit without accepting clicks or focus. */
function LeavingInert({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return <div className="contents" inert={!present}>{children}</div>;
}

/**
 * An arc orbiting the stop button marks ongoing work. The rotation is a CSS animation: the slot's presence skips entry
 * animations, which would leave a Motion-driven orbit still when the composer remounts during a run.
 */
function WorkingOrbit() {
  return <svg aria-hidden viewBox="0 0 40 40" className="working-orbit pointer-events-none absolute -inset-1 size-10 text-primary">
    <circle cx="20" cy="20" r="18.25" fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth="1.5" />
    <circle className="working-orbit-arc" cx="20" cy="20" r="18.25" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeDasharray="30 85" />
  </svg>;
}

export function MessageComposer({ draft, inputRef, ready, executionState, writable, onSend, onSave, onCancel, onContinue }: {
  draft: MessageDraft; inputRef: RefObject<ComposerEditorHandle | null>;
  ready: boolean; executionState: AgentExecutionState; writable: boolean;
  onSend(): Promise<void>; onSave(): Promise<unknown>; onCancel(): Promise<unknown>; onContinue(): Promise<void>;
}) {
  const i18n = useI18n();
  const { pathForFile } = useRendererApplication();
  const reducedMotion = useReducedMotion() === true;
  const [fileDrag, setFileDrag] = useState<FileDropTarget | "over" | null>(null);
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const [controlPending, setControlPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const control = async (work: () => Promise<unknown>) => {
    if (controlPending) return;
    setControlPending(true);
    try { await work(); } finally { setControlPending(false); }
  };
  const running = executionState === "running";
  const cancelDisabled = !ready || controlPending;
  const busy = state.locked;
  const dropsEnabled = ready && !busy;
  const empty = !state.text.trim() && !state.files.length;
  const onFileError = (error: UiText) => toast.error(i18n.text(error));
  // Capture file drags before the editor or workbench can interpret them. Text and references pass through.
  const onFileDrag = (event: DragEvent) => {
    if (!isFileDrag(event.dataTransfer.types)) return;
    event.preventDefault(); event.stopPropagation();
    const target = dropTarget(event.target);
    const { locked, uploading } = draft.getSnapshot();
    const enabled = ready && !locked;
    setFileDrag(enabled ? target ?? "over" : null);
    event.dataTransfer.dropEffect = enabled && target && (target !== "attach" || !uploading) ? "copy" : "none";
  };
  const onDrop = (event: DragEvent) => {
    if (!isFileDrag(event.dataTransfer.types)) return;
    event.preventDefault(); event.stopPropagation();
    setFileDrag(null);
    if (!ready || draft.getSnapshot().locked) return;
    const target = dropTarget(event.target);
    if (target === "attach") void draft.add(Array.from(event.dataTransfer.files), onFileError);
    if (target === "paths") {
      const text = droppedPathText(Array.from(event.dataTransfer.files), pathForFile);
      if (text === null) toast.error(i18n.text(conversationMessages.pathsUnavailable));
      else if (inputRef.current?.appendText(text) === "tooLong") {
        toast.error(i18n.formatMessage(conversationMessages.inputTooLong, { limit: composerTextLimit }));
      }
    }
  };
  return <form ref={form} onPaste={fileInputEvents(draft, !dropsEnabled, onFileError).onPaste}
    onSubmit={event => { event.preventDefault(); void onSend(); }}>
  {/* The editor sheet rests inside the tray, raised by the same faint edge shadow as card content. */}
  <InputGroup className={cn("rounded-(--radius-inset) border-0 bg-card shadow-(--shadow-sheet) dark:bg-card",
    "has-[[data-slot=input-group-control]:focus-visible]:ring-0")}
    onDragEnterCapture={onFileDrag} onDragOverCapture={onFileDrag} onDropCapture={onDrop}
    onDragLeave={event => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setFileDrag(null);
    }}>
    <ComposerEditor ref={inputRef} value={state.text} disabled={busy} onChange={draft.setText}
      onSubmit={() => form.current?.requestSubmit()}
      label={i18n.formatMessage(conversationMessages.messagePlaceholder)}
      placeholder={i18n.formatMessage(conversationMessages.inputPlaceholder)} />
    <InputGroupAddon align="block-end" data-disabled={busy} className="min-w-0 gap-1 px-1.5 pb-1.5 data-[disabled=true]:cursor-default">
      <AttachFiles draft={draft} disabled={busy || !ready} onError={onFileError} />
      <IconButton type="button" variant="ghost" size="icon-sm" label={i18n.text(conversationMessages.saveDraft)}
        disabled={busy || !ready || state.uploading || empty} onClick={() => { void onSave(); }}><Archive /></IconButton>
      <DraftFiles draft={draft} disabled={busy} />
      <AnimatePresence initial={false}>
        {!running && executionState === "incomplete" && <motion.div key="continue" className="shrink-0"
          initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }}
          transition={reducedMotion ? immediateTransition : conversationTransition}>
          <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={!writable || controlPending}
            onClick={() => { void control(onContinue); }}>{i18n.formatMessage(conversationMessages.continue)}</Button>
        </motion.div>}
      </AnimatePresence>
      <PrimaryActionSlot swapKey={running ? "stop" : "send"}>
        {running ? <>
          <IconButton type="button" variant="secondary" size="icon-sm" className="rounded-full" disabled={cancelDisabled}
            label={i18n.formatMessage(conversationMessages.stop)} onClick={() => { void control(onCancel); }}>
            <Square className="size-3 fill-current" />
          </IconButton>
          <WorkingOrbit />
        </> : <IconButton type="submit" variant="default" size="icon-sm" className="rounded-full transition-[opacity,transform] active:scale-90"
          disabled={!writable || state.uploading || empty} label={i18n.formatMessage(commonMessages.sendMessage)}><ArrowUp /></IconButton>}
      </PrimaryActionSlot>
    </InputGroupAddon>
    {dropsEnabled && fileDrag && <div className="absolute inset-0 z-10 grid select-none grid-cols-2 gap-1 rounded-[inherit] bg-card p-1">
      {fileDropTargets.map(({ id, label, Icon }) => {
        const disabled = id === "attach" && state.uploading;
        return <div key={id} data-file-drop={id} aria-disabled={disabled || undefined}
          className={cn("flex min-w-0 flex-col items-center justify-center gap-2 rounded-md border border-dashed px-2 text-center type-caption transition-colors duration-150",
            disabled ? "opacity-50" : fileDrag === id ? "border-primary bg-primary/5 text-primary-text" : "border-input text-muted-foreground")}>
          <Icon className="pointer-events-none size-4" aria-hidden />
          <span className="pointer-events-none">{i18n.text(label)}</span>
        </div>;
      })}
    </div>}
  </InputGroup>
</form>;
}
