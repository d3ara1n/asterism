import { useEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent } from "react";
import { useI18n, type ContentReader } from "@asterism/sdk/renderer";
import { type ModelFilePart, previewsAsImage } from "@asterism/sdk/contracts";
import { File as FileIcon, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { Button } from "@asterism/ui/ui/button";
import { Attachment, AttachmentGroup, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions, AttachmentAction, AttachmentTrigger } from "@asterism/ui/ui/attachment";
import { Tooltip, TooltipTrigger, TooltipContent } from "@asterism/ui/ui/tooltip";
import { Spinner } from "@asterism/ui/ui/spinner";
import { cn } from "@asterism/ui/utils";
import { mediaMessages } from "../../messages/media";
import type { MessageDraft } from "./draft";

function useFileImage(part: ModelFilePart, content: ContentReader) {
  const [preview, setPreview] = useState<{ url?: string; failed?: boolean }>({});
  const id = part.file["$asterism.content"];
  useEffect(() => {
    setPreview({});
    let active = true, url: string | undefined;
    if (previewsAsImage(part.mediaType)) void content.read({ "$asterism.content": id }).then(bytes => {
      if (!active) return;
      url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: part.mediaType }));
      setPreview({ url });
    }).catch(() => { if (active) setPreview({ failed: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id, part.mediaType, content]);
  return { ...preview, fail: () => setPreview({ failed: true }) };
}

export function FilePreview({ part, content }: { part: ModelFilePart; content: ContentReader }) {
  const i18n = useI18n();
  const preview = useFileImage(part, content);
  return <Attachment state={preview.failed ? "error" : "done"} orientation={previewsAsImage(part.mediaType) ? "vertical" : "horizontal"} className="max-w-48">
    <AttachmentMedia variant={preview.url ? "image" : "icon"}>
      {preview.url ? <img src={preview.url} alt={part.filename ?? part.mediaType}
        onError={preview.fail} /> : <FileIcon />}
    </AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle title={part.filename ?? part.mediaType}>{part.filename ?? part.mediaType}</AttachmentTitle>
      {preview.failed && <AttachmentDescription>{i18n.text(mediaMessages.unavailable)}</AttachmentDescription>}
    </AttachmentContent>
  </Attachment>;
}

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

function DraftFile({ part, content, disabled, onRemove }: {
  part: ModelFilePart; content: ContentReader; disabled: boolean; onRemove(): void;
}) {
  const i18n = useI18n();
  const name = part.filename ?? part.mediaType;
  const dot = part.filename?.lastIndexOf(".") ?? -1;
  const extension = dot > 0 ? name.slice(dot) : "";
  const Icon = previewsAsImage(part.mediaType) ? ImageIcon : FileIcon;
  return <Tooltip delayDuration={400}>
    <Attachment size="xs" className="h-6 min-w-0 max-w-48 flex-nowrap has-data-[slot=attachment-content]:py-0">
      <Icon className="size-3.5 shrink-0" />
      <AttachmentContent>
        <AttachmentTitle className="flex">
          <span className="truncate">{extension ? name.slice(0, dot) : name}</span>
          {extension && <span className="max-w-16 shrink-0 truncate">{extension}</span>}
        </AttachmentTitle>
      </AttachmentContent>
      <TooltipTrigger asChild><AttachmentTrigger aria-label={name} /></TooltipTrigger>
      <AttachmentActions><AttachmentAction type="button" className="size-5" disabled={disabled} onClick={onRemove}
        aria-label={`${i18n.text(mediaMessages.remove)}: ${name}`} title={i18n.text(mediaMessages.remove)}><X /></AttachmentAction></AttachmentActions>
    </Attachment>
    <TooltipContent side="top" sideOffset={8} aria-label={name} className="max-h-(--radix-tooltip-content-available-height) max-w-[min(18rem,var(--radix-tooltip-content-available-width))] overflow-y-auto">
      <DraftFileDetails part={part} content={content} />
    </TooltipContent>
  </Tooltip>;
}

export function DraftFiles({ draft, disabled, className }: { draft: MessageDraft; disabled: boolean; className?: string }) {
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  return <AttachmentGroup className={cn("h-8 min-w-0 flex-1 items-center gap-1 px-1 py-0", className)} style={{ scrollbarWidth: "thin" }}>
    {state.files.map(({ part }, index) => <DraftFile key={`${part.file["$asterism.content"]}:${index}`} part={part} content={draft.content()}
      disabled={disabled || state.uploading} onRemove={() => draft.remove(index)} />)}
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
    {state.uploading && <><span role="status" className="type-caption">{i18n.text(mediaMessages.uploading)}</span>
      <Button type="button" size="icon-xs" variant="ghost" onClick={draft.cancelUpload} aria-label={i18n.text(mediaMessages.cancel)}><X /></Button></>}
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
