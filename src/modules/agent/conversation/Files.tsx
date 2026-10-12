import { useEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent } from "react";
import { useI18n, type ContentReader } from "@atelier/sdk/renderer";
import type { ModelFilePart } from "@atelier/sdk/contracts";
import { File as FileIcon, Paperclip, X } from "lucide-react";
import { Button } from "../../../renderer/shared/ui/button";
import { Attachment, AttachmentGroup, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription,
  AttachmentActions, AttachmentAction } from "../../../renderer/shared/ui/attachment";
import { mediaMessages } from "../../messages/media";
import { inputMediaTypes } from "../../../shared/model-media";
import type { MessageDraft } from "./draft";

export function FilePreview({ part, content, onRemove, disabled }: {
  part: ModelFilePart; content: ContentReader; onRemove?(): void; disabled?: boolean;
}) {
  const i18n = useI18n();
  const [preview, setPreview] = useState<{ url?: string; failed?: boolean }>({});
  const id = part.file["$atelier.content"];
  useEffect(() => {
    setPreview({});
    let active = true, url: string | undefined;
    if (part.mediaType.startsWith("image/")) void content.read({ "$atelier.content": id }).then(bytes => {
      if (!active) return;
      url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: part.mediaType }));
      setPreview({ url });
    }).catch(() => { if (active) setPreview({ failed: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id, part.mediaType, content]);
  return <Attachment state={preview.failed ? "error" : "done"} orientation={part.mediaType.startsWith("image/") ? "vertical" : "horizontal"} className="max-w-48">
    <AttachmentMedia variant={preview.url ? "image" : "icon"}>
      {preview.url ? <img src={preview.url} alt={part.filename ?? part.mediaType}
        onError={() => setPreview({ failed: true })} /> : <FileIcon />}
    </AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle title={part.filename ?? part.mediaType}>{part.filename ?? part.mediaType}</AttachmentTitle>
      {preview.failed && <AttachmentDescription>{i18n.text(mediaMessages.unavailable)}</AttachmentDescription>}
    </AttachmentContent>
    {onRemove && <AttachmentActions><AttachmentAction type="button" disabled={disabled}
      onClick={onRemove} aria-label={i18n.text(mediaMessages.remove)} title={i18n.text(mediaMessages.remove)}><X /></AttachmentAction></AttachmentActions>}
  </Attachment>;
}

export function DraftFiles({ draft, disabled }: { draft: MessageDraft; disabled: boolean }) {
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const i18n = useI18n();
  return <>
    {state.files.length > 0 && <AttachmentGroup className="px-3 py-2">
      {state.files.map(({ part }, index) => <FilePreview key={`${part.file["$atelier.content"]}:${index}`} part={part} content={draft.content()}
        disabled={disabled || state.uploading} onRemove={() => draft.remove(index)} />)}
    </AttachmentGroup>}
    {state.error && <p role="alert" className="type-caption px-3 text-destructive">{i18n.text(state.error)}</p>}
  </>;
}
export function AttachFiles({ draft, disabled }: { draft: MessageDraft; disabled: boolean }) {
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const input = useRef<HTMLInputElement>(null);
  const i18n = useI18n();
  return <div className="flex min-w-0 items-center gap-1">
    <input ref={input} type="file" multiple accept={inputMediaTypes.join(",")} className="hidden" disabled={disabled || state.uploading}
      onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void draft.add(files); }} />
    <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || state.uploading} onClick={() => input.current?.click()}
      aria-label={i18n.text(mediaMessages.attach)} title={i18n.text(mediaMessages.attach)}><Paperclip /></Button>
    {state.uploading && <><span role="status" className="type-caption">{i18n.text(mediaMessages.uploading)}</span>
      <Button type="button" size="icon-xs" variant="ghost" onClick={draft.cancelUpload} aria-label={i18n.text(mediaMessages.cancel)}><X /></Button></>}
  </div>;
}
/** 文件由对话入口受理，阻止冒泡到工作台创建路由；普通文字粘贴沿用输入框行为。 */
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
