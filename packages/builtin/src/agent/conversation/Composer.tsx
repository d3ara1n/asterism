import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { useI18n, useRendererApplication } from "@asterism-app/sdk/renderer";
import { Square, ArrowUp, Archive, Paperclip, FileType } from "lucide-react";
import { useRef, useState, useSyncExternalStore, type DragEvent, type RefObject } from "react";
import { composerTextLimit, type MessageDraft } from "./draft";
import type { AgentExecutionState } from "../state";
import { AttachFiles, DraftFiles, DraftFileError, fileInputEvents } from "./Files";
import { ComposerEditor, type ComposerEditorHandle } from "./composer-editor";
import { droppedPathText, isFileDrag } from "./file-drop";
import { toast } from "sonner";
import { cn } from "@asterism-app/ui/utils";

import { Button } from "@asterism-app/ui/ui/button";
import { InputGroup, InputGroupAddon } from "@asterism-app/ui/ui/input-group";
import { commonMessages } from "../../messages/common";
import { conversationMessages } from "../../messages/conversation";
import { mediaMessages } from "../../messages/media";

const fileDropTargets = [
  { id: "attach", label: mediaMessages.attach, Icon: Paperclip },
  { id: "paths", label: conversationMessages.insertPaths, Icon: FileType },
] as const;
type FileDropTarget = typeof fileDropTargets[number]["id"];

function dropTarget(target: EventTarget): FileDropTarget | null {
  const id = target instanceof Element && target.closest("[data-file-drop]")?.getAttribute("data-file-drop");
  return id === "attach" || id === "paths" ? id : null;
}

export function MessageComposer({ draft, inputRef, ready, executionState, writable, onSend, onSave, onCancel, onContinue }: {
  draft: MessageDraft; inputRef: RefObject<ComposerEditorHandle | null>;
  ready: boolean; executionState: AgentExecutionState; writable: boolean;
  onSend(): Promise<void>; onSave(): Promise<unknown>; onCancel(): Promise<unknown>; onContinue(): Promise<void>;
}) {
  const i18n = useI18n();
  const { pathForFile } = useRendererApplication();
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
    if (target === "attach") void draft.add(Array.from(event.dataTransfer.files));
    if (target === "paths") {
      const text = droppedPathText(Array.from(event.dataTransfer.files), pathForFile);
      if (text === null) toast.error(i18n.text(conversationMessages.pathsUnavailable));
      else if (inputRef.current?.appendText(text) === "tooLong") {
        toast.error(i18n.formatMessage(conversationMessages.inputTooLong, { limit: composerTextLimit }));
      }
    }
  };
  return <form ref={form} onPaste={fileInputEvents(draft, !dropsEnabled).onPaste}
    onSubmit={event => { event.preventDefault(); void onSend(); }}>
  <InputGroup onDragEnterCapture={onFileDrag} onDragOverCapture={onFileDrag} onDropCapture={onDrop}
    onDragLeave={event => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setFileDrag(null);
    }}>
    <ComposerEditor ref={inputRef} value={state.text} disabled={busy} onChange={draft.setText}
      onSubmit={() => form.current?.requestSubmit()}
      label={i18n.formatMessage(conversationMessages.messagePlaceholder)}
      placeholder={i18n.formatMessage(conversationMessages.inputPlaceholder)} />
    <InputGroupAddon align="block-end" data-disabled={busy} className="min-w-0 gap-1 data-[disabled=true]:cursor-default">
      <AttachFiles draft={draft} disabled={busy || !ready} />
      <DraftFiles draft={draft} disabled={busy} />
      <Button type="button" size="sm" variant="ghost" disabled={busy || !ready || state.uploading || (!state.text.trim() && !state.files.length)}
        onClick={() => { void onSave(); }}><Archive />{i18n.text(conversationMessages.saveDraft)}</Button>
      {running ? <Button type="button" size="sm" variant="secondary" disabled={cancelDisabled}
        onClick={() => { void control(onCancel); }}><Square />{i18n.formatMessage(conversationMessages.stop)}</Button>
        : <div className="flex shrink-0 gap-1">
          {executionState === "incomplete" && <Button type="button" size="sm" variant="ghost" disabled={!writable || controlPending} onClick={() => { void control(onContinue); }}>{i18n.formatMessage(conversationMessages.continue)}</Button>}
          <IconButton type="submit" variant="default" size="icon-sm" disabled={!writable || state.uploading || (!state.text.trim() && !state.files.length)} label={i18n.formatMessage(commonMessages.sendMessage)}><ArrowUp /></IconButton>
        </div>}
    </InputGroupAddon>
    {dropsEnabled && fileDrag && <div className="absolute inset-0 z-10 grid select-none grid-cols-2 divide-x overflow-hidden rounded-md bg-background">
      {fileDropTargets.map(({ id, label, Icon }) => {
        const disabled = id === "attach" && state.uploading;
        return <div key={id} data-file-drop={id} aria-disabled={disabled || undefined}
          className={cn("flex min-w-0 flex-col items-center justify-center gap-2 px-2 text-center type-caption",
            disabled ? "opacity-50" : fileDrag === id ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>
          <Icon className="pointer-events-none size-4" aria-hidden />
          <span className="pointer-events-none">{i18n.text(label)}</span>
        </div>;
      })}
    </div>}
  </InputGroup>
  <DraftFileError draft={draft} className="mt-1" />
</form>;
}
