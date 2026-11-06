import { useRef, useSyncExternalStore, type ClipboardEvent, type DragEvent } from "react";
import { AnimatePresence, motion, useReducedMotion, type MotionProps } from "motion/react";
import { useI18n, type ContentReader } from "@asterism-app/sdk/renderer";
import { type ModelFilePart, previewsAsImage } from "@asterism-app/sdk/contracts";
import { inputFileName, type AgentInputPart } from "@asterism-app/builtin-api/contracts";
import { File as FileIcon, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import { Attachment, AttachmentGroup, AttachmentContent, AttachmentTitle, AttachmentActions, AttachmentAction, AttachmentTrigger } from "@asterism-app/ui/ui/attachment";
import { Tooltip, TooltipTrigger, TooltipContent } from "@asterism-app/ui/ui/tooltip";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { cn } from "@asterism-app/ui/utils";
import { mediaMessages } from "../../messages/media";
import type { MessageDraft, PendingFile } from "./draft";
import { useFileImage } from "../../shared/attachments";
import { conversationEase, immediateTransition } from "./motion";

type InputFile = Exclude<AgentInputPart, { kind: "text" }>;

/** Mounts with the tooltip overlay; releases image read results and temporary URLs when closed. */
function DraftFileDetails({ part, content }: { part: ModelFilePart; content: ContentReader }) {
  const i18n = useI18n();
  const preview = useFileImage(part, content);
  return <div className="space-y-1">
    {previewsAsImage(part.mediaType) && (preview.failed
      ? <p>{i18n.text(mediaMessages.unavailable)}</p>
      : preview.url
        ? <img src={preview.url} alt="" className="max-h-48 max-w-full object-contain" onError={preview.fail} />
        : <Spinner />)}
    <p className="break-all">{part.filename ?? part.mediaType}</p>
    {part.filename && <p>{part.mediaType}</p>}
  </div>;
}

/** One card from acceptance to completion: a pending file is dimmed under a sweeping sheen and its remove action cancels the addition. */
function DraftFile({ file, content, disabled, onRemove }: {
  file: { part: InputFile } | { pending: PendingFile }; content: ContentReader; disabled: boolean; onRemove(): void;
}) {
  const i18n = useI18n();
  const reducedMotion = useReducedMotion() === true;
  const pending = "pending" in file ? file.pending : null;
  const part = "part" in file ? file.part : null;
  const name = part ? inputFileName(part) : pending!.name || pending!.mediaType;
  const filename = part ? part.filename : pending!.name;
  const dot = filename?.lastIndexOf(".") ?? -1;
  const extension = dot > 0 ? name.slice(dot) : "";
  const mediaType = part ? (part.kind === "file" ? part.mediaType : null) : pending!.mediaType;
  const Icon = mediaType && previewsAsImage(mediaType) ? ImageIcon : FileIcon;
  const action = i18n.text(pending ? mediaMessages.cancel : mediaMessages.remove);
  return <Tooltip delayDuration={400}>
    <Attachment size="xs" state={pending ? "uploading" : "done"}
      className={cn("h-6 min-w-0 max-w-48 flex-nowrap has-data-[slot=attachment-content]:py-0", pending && "overflow-hidden")}>
      {/* Staging reports no progress, so the sheen marks activity rather than a fraction. */}
      <AnimatePresence initial={false}>
        {pending && !reducedMotion && <motion.span key="sheen" aria-hidden className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--foreground) 10%, transparent) 50%, transparent 100%)", backgroundSize: "200% 100%" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1, backgroundPosition: ["150% 0%", "-50% 0%"] }} exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 0.2 }, backgroundPosition: { duration: 1.4, ease: "linear", repeat: Infinity } }} />}
      </AnimatePresence>
      <Icon className={cn("size-3.5 shrink-0 transition-opacity duration-200", pending && "opacity-50")} />
      <AttachmentContent className={cn("transition-opacity duration-200", pending && "opacity-50")}>
        <AttachmentTitle className="flex">
          <span className="truncate">{extension ? name.slice(0, dot) : name}</span>
          {extension && <span className="max-w-16 shrink-0 truncate">{extension}</span>}
        </AttachmentTitle>
      </AttachmentContent>
      <TooltipTrigger asChild><AttachmentTrigger aria-label={pending ? `${name}, ${i18n.text(mediaMessages.uploading)}` : name} /></TooltipTrigger>
      <AttachmentActions><AttachmentAction type="button" className="size-5" disabled={disabled} onClick={onRemove}
        aria-label={`${action}: ${name}`} title={action}><X /></AttachmentAction></AttachmentActions>
    </Attachment>
    <TooltipContent side="top" sideOffset={8} aria-label={name} className="max-h-(--radix-tooltip-content-available-height) max-w-[min(18rem,var(--radix-tooltip-content-available-width))] overflow-y-auto">
      {part?.kind === "file" ? <DraftFileDetails part={part} content={content} /> : <p>{name}</p>}
    </TooltipContent>
  </Tooltip>;
}

/** Single additions grow into the row and removals fold out of it; clipping applies only while the width moves, so focus rings stay visible at rest. */
function fileMotion(reducedMotion: boolean): MotionProps {
  if (reducedMotion) return { initial: { width: 0, opacity: 0 }, animate: { width: "auto", opacity: 1 }, exit: { width: 0, opacity: 0 }, transition: immediateTransition };
  return {
    initial: { width: 0, opacity: 0, scale: 0.9, overflow: "hidden" },
    animate: { width: "auto", opacity: 1, scale: 1, transitionEnd: { overflow: "visible" }, transition: {
      width: { duration: 0.18, ease: conversationEase },
      opacity: { duration: 0.16, delay: 0.06, ease: conversationEase },
      scale: { duration: 0.2, delay: 0.06, ease: conversationEase },
    } },
    // The file fades first; its neighbours close the gap behind it.
    exit: { width: 0, opacity: 0, scale: 0.9, overflow: "hidden", transition: {
      opacity: { duration: 0.12, ease: "easeIn" },
      scale: { duration: 0.14, ease: "easeIn" },
      width: { duration: 0.18, delay: 0.08, ease: conversationEase },
    } },
  };
}

export function DraftFiles({ draft, disabled, className }: { draft: MessageDraft; disabled: boolean; className?: string }) {
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const reducedMotion = useReducedMotion() === true;
  // Spacing lives inside each item so a folded item takes no room; the group itself has no gap.
  return <AttachmentGroup className={cn("h-8 min-w-0 flex-1 items-center gap-0 px-0.5 py-0", className)} style={{ scrollbarWidth: "thin" }}>
    {/* A whole-list replacement switches at once with the editor text; only single additions and removals animate.
        Completed and pending files render as one keyed list, so a file that finishes keeps its card. */}
    <AnimatePresence key={state.batch} initial={false}>
      {[...state.files.map(({ id, part }) => ({ id, file: { part } })), ...state.uploads.map(pending => ({ id: pending.id, file: { pending } }))]
        .map(({ id, file }) => <motion.div key={id} className="flex-none snap-start" {...fileMotion(reducedMotion)}>
          <div className="px-0.5">
            <DraftFile file={file} content={draft.content()} disabled={disabled || ("part" in file && state.uploading)} onRemove={() => {
              if ("pending" in file) { draft.removeUpload(id); return; }
              // Resolve the position at click time; a leaving item no longer matches and does nothing.
              const index = draft.getSnapshot().files.findIndex(item => item.id === id);
              if (index >= 0) draft.remove(index);
            }} />
          </div>
        </motion.div>)}
    </AnimatePresence>
  </AttachmentGroup>;
}

export function DraftFileError({ draft, className }: { draft: MessageDraft; className?: string }) {
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const i18n = useI18n();
  return state.error && <p role="alert" className={cn("type-caption text-destructive", className)}>{i18n.text(state.error)}</p>;
}
export function AttachFiles({ draft, disabled }: { draft: MessageDraft; disabled: boolean }) {
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const input = useRef<HTMLInputElement>(null);
  const i18n = useI18n();
  return <div className="flex shrink-0 items-center gap-1">
    <input ref={input} type="file" multiple className="hidden" disabled={disabled || state.uploading}
      onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void draft.add(files); }} />
    <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || state.uploading} onClick={() => input.current?.click()}
      aria-label={i18n.text(mediaMessages.attach)} title={i18n.text(mediaMessages.attach)}><Paperclip /></Button>
  </div>;
}
/** Files are accepted by the conversation entry point, preventing propagation to workbench creation routing; plain-text paste retains input behavior. */
export function fileInputEvents(draft: MessageDraft, disabled: boolean) {
  return {
    onPaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData.files);
      if (!files.length) return;
      event.preventDefault(); event.stopPropagation();
      if (!disabled) void draft.add(files);
    },
    onDragOver(event: DragEvent) {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    },
    onDrop(event: DragEvent) {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault(); event.stopPropagation();
      if (!disabled) void draft.add(Array.from(event.dataTransfer.files));
    },
  };
}
