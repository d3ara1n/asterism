import { useEffect, useRef, useState, type ComponentProps } from "react";
import { toast } from "sonner";
import { useI18n, useRendererApplication, type ContentReader, type I18n } from "@asterism-app/sdk/renderer";
import { modelInputLimits, previewsAsImage, type ModelFilePart } from "@asterism-app/sdk/contracts";
import { inputFileName, type AgentInputPart } from "@asterism-app/builtin-api/contracts";
import { Download, File as FileIcon, FileArchive, FileAudio, FileText, FileVideo, Image as ImageIcon, ImageOff } from "lucide-react";
import { Attachment, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions, AttachmentAction, AttachmentTrigger } from "@asterism-app/ui/ui/attachment";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@asterism-app/ui/ui/dialog";
import { Button } from "@asterism-app/ui/ui/button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { cn } from "@asterism-app/ui/utils";
import { mediaMessages as messages } from "../messages/media";

export type InputFile = Exclude<AgentInputPart, { kind: "text" }>;
type Preview = { url?: string; failed?: boolean; fail(): void };

/** Read a stream into an object URL while mounted; unmounting stops the read and releases the URL. */
function useStreamImage(key: string | null, mediaType: string | undefined, open: () => AsyncIterable<Uint8Array>): Preview {
  const [preview, setPreview] = useState<{ url?: string; failed?: boolean }>({});
  const opener = useRef(open);
  opener.current = open;
  useEffect(() => {
    setPreview({});
    if (key === null || !mediaType || !previewsAsImage(mediaType)) return;
    let active = true, url: string | undefined;
    const iterator = opener.current()[Symbol.asyncIterator]();
    void (async () => {
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
        if (!active) return;
        chunks.push(Uint8Array.from(next.value));
      }
      if (!active) return;
      url = URL.createObjectURL(new Blob(chunks, { type: mediaType }));
      setPreview({ url });
    })().catch(() => { if (active) setPreview({ failed: true }); });
    return () => { active = false; void iterator.return?.(); if (url) URL.revokeObjectURL(url); };
  }, [key, mediaType]);
  return { ...preview, fail: () => setPreview({ failed: true }) };
}
export function useFileImage(part: ModelFilePart, content: ContentReader): Preview {
  return useStreamImage(part.file["$asterism.content"], part.mediaType, () => content.open(part.file));
}

/** Captured images always preview; image references preview through their source only with a known size within the model file limit. */
export function previewable(part: InputFile): boolean {
  return !!part.mediaType && previewsAsImage(part.mediaType)
    && (part.kind === "file" || (part.size !== undefined && part.size <= modelInputLimits.file));
}
function useOpener(part: InputFile, content: ContentReader) {
  const application = useRendererApplication();
  return () => part.kind === "file" ? content.open(part.file) : application.files.open(part.ref);
}
/** The image preview of a part, or undefined when the part does not preview as an image. */
function usePartImage(part: InputFile, content: ContentReader): Preview | undefined {
  const enabled = previewable(part);
  const key = !enabled ? null : part.kind === "file" ? part.file["$asterism.content"] : JSON.stringify(part.ref);
  const preview = useStreamImage(key, part.mediaType, useOpener(part, content));
  return enabled ? preview : undefined;
}
function partKey(part: InputFile, index: number) {
  return `${part.kind === "file" ? part.file["$asterism.content"] : JSON.stringify(part.ref)}:${index}`;
}
function fileDetails(i18n: I18n, part: InputFile) {
  return [part.mediaType, part.size === undefined ? undefined
    : i18n.formatNumber(part.size, { style: "unit", unit: "byte", notation: "compact", maximumFractionDigits: 1 })].filter(Boolean).join(" · ");
}
function FileTypeIcon({ mediaType }: { mediaType?: string }) {
  const type = mediaType ?? "";
  const Icon = type.startsWith("image/") ? ImageIcon : type.startsWith("audio/") ? FileAudio : type.startsWith("video/") ? FileVideo
    : /zip|compressed|tar|gzip|7z|rar/u.test(type) ? FileArchive : type.startsWith("text/") || /pdf|json|xml|document|markdown/u.test(type) ? FileText : FileIcon;
  return <Icon />;
}

/** Save through the native dialog; unmounting cancels an unfinished transfer, which keeps the previous destination. Outcomes are reported as toasts. */
function useSave(name: string, open: () => AsyncIterable<Uint8Array>) {
  const application = useRendererApplication(), i18n = useI18n();
  const [saving, setSaving] = useState(false);
  const mounted = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); mounted.current = controller; return () => controller.abort(); }, []);
  const save = async () => {
    const signal = mounted.current?.signal;
    if (saving || !signal) return;
    setSaving(true);
    async function* source() {
      for await (const chunk of open()) { signal!.throwIfAborted(); yield chunk; }
    }
    try {
      if (await application.files.save(name, source()) && !signal.aborted) toast.success(i18n.formatMessage(messages.saved, { name }));
    } catch (error) {
      if (!signal.aborted) toast.error(error instanceof Error ? error.message : i18n.text(messages.saveFailed));
    } finally { if (!signal.aborted) setSaving(false); }
  };
  return { saving, save };
}

function PreviewDialog({ open, onOpenChange, name, details, url, onError, saving, save }: {
  open: boolean; onOpenChange(open: boolean): void; name: string; details: string; url: string; onError(): void; saving: boolean; save(): void;
}) {
  const i18n = useI18n();
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-[min(90vw,80rem)] sm:max-w-[min(90vw,80rem)]">
      <DialogHeader><DialogTitle className="break-all">{name}</DialogTitle><DialogDescription>{details}</DialogDescription></DialogHeader>
      <img src={url} alt={name} className="max-h-[75vh] w-full object-contain" onError={onError} />
      <div className="flex justify-end"><Button variant="outline" disabled={saving} onClick={save}>
        {saving ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}{i18n.text(messages.saveAs)}
      </Button></div>
    </DialogContent>
  </Dialog>;
}

/** A standalone file result, such as a tool output: images show a large preview card, other files a file card. */
export function FilePreview({ part, content }: { part: InputFile; content: ContentReader }) {
  const i18n = useI18n();
  const [open, setOpen] = useState(false);
  const preview = usePartImage(part, content);
  const name = inputFileName(part), details = fileDetails(i18n, part);
  const { saving, save } = useSave(name, useOpener(part, content));
  const failure = preview?.failed ? i18n.text(messages.unavailable) : null;
  return <>
    <Attachment state={failure ? "error" : preview && !preview.url ? "processing" : "done"} orientation={preview ? "vertical" : "horizontal"} className="max-w-64">
      <AttachmentMedia variant={preview?.url ? "image" : "icon"}>
        {preview?.url ? <img src={preview.url} alt={name} onError={preview.fail} />
          : preview && !preview.failed ? <Spinner /> : <FileTypeIcon mediaType={part.mediaType} />}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={name}>{name}</AttachmentTitle>
        <AttachmentDescription title={failure ?? details}>{failure ?? details}</AttachmentDescription>
      </AttachmentContent>
      {preview?.url && <AttachmentTrigger aria-label={i18n.text(messages.preview)} onClick={() => setOpen(true)} />}
      <AttachmentActions><AttachmentAction aria-label={i18n.text(messages.saveAs)} title={i18n.text(messages.saveAs)}
        disabled={saving} aria-busy={saving || undefined} onClick={() => void save()}>{saving ? <Spinner /> : <Download />}</AttachmentAction></AttachmentActions>
    </Attachment>
    {preview?.url && <PreviewDialog open={open} onOpenChange={setOpen} name={name} details={details} url={preview.url} onError={preview.fail}
      saving={saving} save={() => void save()} />}
  </>;
}

/**
 * Attachments of a message, kept apart from its text: images form a wrapping row of thumbnails, other files follow as compact rows.
 * Order is preserved within each kind. A single image keeps its aspect ratio within a bounded size; several images share square tiles.
 */
export function MessageAttachments({ parts, content, align = "start", className, ...props }: Omit<ComponentProps<"div">, "content"> & {
  parts: readonly InputFile[]; content: ContentReader; align?: "start" | "end";
}) {
  if (!parts.length) return null;
  const images = parts.filter(previewable), files = parts.filter(part => !previewable(part));
  return <div data-slot="message-attachments" className={cn("flex min-w-0 max-w-full flex-col gap-1.5", align === "end" ? "items-end" : "items-start", className)} {...props}>
    {images.length > 0 && <div className={cn("flex max-w-full flex-wrap gap-1.5", align === "end" && "justify-end")}>
      {images.map((part, index) => <ImageTile key={partKey(part, index)} part={part} content={content} single={images.length === 1} />)}
    </div>}
    {files.map((part, index) => <FileRow key={partKey(part, index)} part={part} content={content} />)}
  </div>;
}

function ImageTile({ part, content, single }: { part: InputFile; content: ContentReader; single: boolean }) {
  const i18n = useI18n();
  const [open, setOpen] = useState(false), [loaded, setLoaded] = useState(false);
  const preview = usePartImage(part, content)!;
  const name = inputFileName(part), details = fileDetails(i18n, part);
  const { saving, save } = useSave(name, useOpener(part, content));
  const shown = preview.url && !preview.failed;
  return <div className={cn("group/tile relative shrink-0 overflow-hidden rounded-xl border bg-muted",
    single ? (shown && loaded ? "h-32 min-w-16 max-w-48" : "h-32 w-32") : "size-20")}>
    <button type="button" disabled={!shown} title={name} aria-label={`${i18n.text(messages.preview)}: ${name}`} onClick={() => setOpen(true)}
      className="flex size-full items-center justify-center text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
      {shown ? <img src={preview.url} alt={name} onLoad={() => setLoaded(true)} onError={preview.fail}
        className={cn("transition-[opacity,scale] duration-300 ease-out group-hover/tile:scale-[1.04] motion-reduce:transition-none",
          single ? "h-full w-auto max-w-48 object-cover" : "size-full object-cover", loaded ? "opacity-100" : "opacity-0")} />
        : preview.failed ? <ImageOff className="size-5" aria-label={i18n.text(messages.unavailable)} />
        : <span className="size-full animate-pulse bg-foreground/5" aria-hidden="true" />}
    </button>
    <Button type="button" variant="secondary" size="icon-xs" aria-label={`${i18n.text(messages.saveAs)}: ${name}`} title={i18n.text(messages.saveAs)}
      disabled={saving} aria-busy={saving || undefined} onClick={() => void save()}
      className={cn("absolute top-1 right-1 bg-background/85 shadow-sm backdrop-blur-sm transition-opacity hover:bg-background focus-visible:opacity-100",
        saving ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100")}>
      {saving ? <Spinner /> : <Download />}
    </Button>
    {shown && <PreviewDialog open={open} onOpenChange={setOpen} name={name} details={details} url={preview.url!} onError={preview.fail}
      saving={saving} save={() => void save()} />}
  </div>;
}

function FileRow({ part, content }: { part: InputFile; content: ContentReader }) {
  const i18n = useI18n();
  const name = inputFileName(part), details = fileDetails(i18n, part);
  const { saving, save } = useSave(name, useOpener(part, content));
  return <Attachment size="sm" className="w-52 min-w-0 max-w-full">
    <AttachmentMedia variant="icon"><FileTypeIcon mediaType={part.mediaType} /></AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle title={name}>{name}</AttachmentTitle>
      <AttachmentDescription title={details}>{details}</AttachmentDescription>
    </AttachmentContent>
    <AttachmentActions><AttachmentAction aria-label={`${i18n.text(messages.saveAs)}: ${name}`} title={i18n.text(messages.saveAs)}
      disabled={saving} aria-busy={saving || undefined} onClick={() => void save()}>{saving ? <Spinner /> : <Download />}</AttachmentAction></AttachmentActions>
  </Attachment>;
}
