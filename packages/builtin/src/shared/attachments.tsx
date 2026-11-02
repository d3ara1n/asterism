import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n, useRendererApplication, type ContentReader } from "@asterism-app/sdk/renderer";
import { modelInputLimits, previewsAsImage, type ModelFilePart } from "@asterism-app/sdk/contracts";
import { inputFileName, type AgentInputPart } from "@asterism-app/builtin-api/contracts";
import { Download, File as FileIcon, Image as ImageIcon } from "lucide-react";
import { Attachment, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions, AttachmentAction, AttachmentTrigger } from "@asterism-app/ui/ui/attachment";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@asterism-app/ui/ui/dialog";
import { Button } from "@asterism-app/ui/ui/button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { mediaMessages as messages } from "../messages/media";

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

type InputFile = Exclude<AgentInputPart, { kind: "text" }>;
type ReferencePart = Extract<InputFile, { kind: "file-reference" }>;
export function FilePreview({ part, content }: { part: InputFile; content: ContentReader }) {
  return part.kind === "file" ? <CapturedPreview part={part} content={content} /> : <ReferencePreview part={part} content={content} />;
}
function CapturedPreview({ part, content }: { part: ModelFilePart; content: ContentReader }) {
  return <AttachmentView part={part} content={content} preview={useFileImage(part, content)} />;
}
/** Image references with a known size within the model file limit preview through their source; others stay file cards. */
function ReferencePreview({ part, content }: { part: ReferencePart; content: ContentReader }) {
  const application = useRendererApplication();
  const previewable = part.size !== undefined && part.size <= modelInputLimits.file;
  const preview = useStreamImage(previewable ? JSON.stringify(part.ref) : null, part.mediaType, () => application.files.open(part.ref));
  return <AttachmentView part={part} content={content} preview={previewable && part.mediaType && previewsAsImage(part.mediaType) ? preview : undefined} />;
}

/** Save through the native dialog; unmounting cancels an unfinished transfer, which keeps the previous destination. */
function useSave(name: string, open: () => AsyncIterable<Uint8Array>) {
  const application = useRendererApplication(), i18n = useI18n();
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const mounted = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); mounted.current = controller; return () => controller.abort(); }, []);
  const save = async () => {
    const signal = mounted.current?.signal;
    if (saving || !signal) return;
    setSaving(true); setError(null);
    async function* source() {
      for await (const chunk of open()) { signal!.throwIfAborted(); yield chunk; }
    }
    try {
      if (await application.files.save(name, source()) && !signal.aborted) toast.success(i18n.formatMessage(messages.saved, { name }));
    } catch (error) {
      if (!signal.aborted) setError(error instanceof Error ? error.message : i18n.text(messages.saveFailed));
    } finally { if (!signal.aborted) setSaving(false); }
  };
  return { saving, error, save };
}

function AttachmentView({ part, content, preview }: { part: InputFile; content: ContentReader; preview?: Preview }) {
  const application = useRendererApplication(), i18n = useI18n();
  const [open, setOpen] = useState(false);
  const name = inputFileName(part), image = !!part.mediaType && previewsAsImage(part.mediaType);
  const { saving, error, save } = useSave(name, () => part.kind === "file" ? content.open(part.file) : application.files.open(part.ref));
  const details = [part.mediaType, part.size === undefined ? undefined : i18n.formatNumber(part.size, { style: "unit", unit: "byte", notation: "compact", maximumFractionDigits: 1 })].filter(Boolean).join(" · ");
  const failure = error ?? (preview?.failed ? i18n.text(messages.unavailable) : null);
  return <>
    <Attachment state={failure ? "error" : preview && !preview.url ? "processing" : "done"} orientation={image && preview ? "vertical" : "horizontal"} className="max-w-64">
      <AttachmentMedia variant={preview?.url ? "image" : "icon"}>
        {preview?.url ? <img src={preview.url} alt={name} onError={preview.fail} />
          : preview && !preview.failed ? <Spinner /> : image ? <ImageIcon /> : <FileIcon />}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={name}>{name}</AttachmentTitle>
        <AttachmentDescription title={failure ?? details}>{failure ?? details}</AttachmentDescription>
      </AttachmentContent>
      {preview?.url && <AttachmentTrigger aria-label={i18n.text(messages.preview)} onClick={() => setOpen(true)} />}
      <AttachmentActions><AttachmentAction aria-label={i18n.text(messages.saveAs)} title={i18n.text(messages.saveAs)}
        disabled={saving} aria-busy={saving || undefined} onClick={() => void save()}>{saving ? <Spinner /> : <Download />}</AttachmentAction></AttachmentActions>
    </Attachment>
    {preview?.url && <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[min(90vw,80rem)] sm:max-w-[min(90vw,80rem)]">
        <DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>{details}</DialogDescription></DialogHeader>
        <img src={preview.url} alt={name} className="max-h-[75vh] w-full object-contain" onError={preview.fail} />
        <div className="flex justify-end"><Button variant="outline" disabled={saving} onClick={() => void save()}>
          {saving ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}{i18n.text(messages.saveAs)}
        </Button></div>
        {error && <p role="alert" className="type-caption text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>}
  </>;
}
