import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MoveHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Button } from "@asterism-app/ui/ui/button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import cMapUrl from "pdfjs-dist/cmaps/?url";
import standardFontDataUrl from "pdfjs-dist/standard_fonts/?url";
import wasmUrl from "pdfjs-dist/wasm/?url";
import "react-pdf/dist/Page/TextLayer.css";
import { mediaMessages as messages } from "../messages/media";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
// The application's CSP keeps WebAssembly compilation disabled. PDF.js supplies local JavaScript image decoders.
const options = { cMapUrl, standardFontDataUrl, wasmUrl, useWasm: false, useWorkerFetch: false };

/** Mounted only for an open PDF: closing stops the file read and releases the document and its worker. */
export default function PdfPreview({ openFile }: { openFile(): AsyncIterable<Uint8Array> }) {
  const i18n = useI18n();
  const opener = useRef(openFile);
  opener.current = openFile;
  const [file, setFile] = useState<Blob>();
  const [failed, setFailed] = useState(false), [locked, setLocked] = useState(false);
  const [pageFailed, setPageFailed] = useState(false);
  const [page, setPage] = useState(1), [pages, setPages] = useState(0);
  const [availableWidth, setAvailableWidth] = useState(0), [naturalWidth, setNaturalWidth] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const iterator = opener.current()[Symbol.asyncIterator]();
    void (async () => {
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
        if (!active) return;
        chunks.push(Uint8Array.from(next.value));
      }
      if (active) setFile(new Blob(chunks, { type: "application/pdf" }));
    })().catch(() => { if (active) setFailed(true); });
    return () => { active = false; void iterator.return?.(); };
  }, []);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(Math.max(1, Math.floor(entry!.contentRect.width - 32))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = zoom ?? (naturalWidth ? availableWidth / naturalWidth : 1);
  const changePage = (next: number) => {
    setPage(next);
    setPageFailed(false);
    viewport.current?.scrollTo(0, 0);
  };
  const loading = <div className="flex min-h-40 items-center justify-center" role="status"><Spinner /></div>;
  const unavailable = <p className="p-4 text-muted-foreground" role="alert">{i18n.text(messages.unavailable)}</p>;
  return <div className="flex min-h-0 min-w-0 flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label={i18n.text(messages.pdfPreviousPage)} title={i18n.text(messages.pdfPreviousPage)}
          disabled={!pages || page <= 1} onClick={() => changePage(page - 1)}><ChevronLeft /></Button>
        <span className="min-w-20 text-center text-sm tabular-nums" aria-live="polite">
          {pages ? i18n.formatMessage(messages.pdfPages, { page, pages }) : "—"}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label={i18n.text(messages.pdfNextPage)} title={i18n.text(messages.pdfNextPage)}
          disabled={!pages || page >= pages} onClick={() => changePage(page + 1)}><ChevronRight /></Button>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label={i18n.text(messages.pdfZoomOut)} title={i18n.text(messages.pdfZoomOut)}
          disabled={!naturalWidth || scale <= 0.25} onClick={() => setZoom(Math.max(0.25, Math.min(4, scale - 0.25)))}><ZoomOut /></Button>
        <span className="min-w-14 text-center text-sm tabular-nums">{naturalWidth ? i18n.formatNumber(scale, { style: "percent", maximumFractionDigits: 0 }) : "—"}</span>
        <Button variant="ghost" size="icon-sm" aria-label={i18n.text(messages.pdfZoomIn)} title={i18n.text(messages.pdfZoomIn)}
          disabled={!naturalWidth || scale >= 4} onClick={() => setZoom(Math.min(4, Math.max(0.25, scale + 0.25)))}><ZoomIn /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={i18n.text(messages.pdfFitWidth)} title={i18n.text(messages.pdfFitWidth)}
          disabled={!naturalWidth} onClick={() => setZoom(null)}><MoveHorizontal /></Button>
      </div>
    </div>
    <div ref={viewport} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain rounded-md border bg-muted">
      {failed ? unavailable : locked ? <p className="p-4 text-muted-foreground" role="status">{i18n.text(messages.pdfPasswordRequired)}</p>
        : !file ? loading : <Document file={file} options={options} suspense={false} loading={loading} error={unavailable}
          onPassword={() => setLocked(true)} onSourceError={() => setFailed(true)} onLoadSuccess={({ numPages }) => setPages(numPages)}
          className="w-fit min-w-full p-4">
          {pageFailed ? unavailable : availableWidth > 0 && <Page pageNumber={page} width={zoom === null ? availableWidth : naturalWidth * zoom}
            suspense={false} renderAnnotationLayer={false} loading={loading} error={unavailable} className="mx-auto w-fit"
            onRenderError={() => setPageFailed(true)} onLoadSuccess={loaded => setNaturalWidth(loaded.getViewport({ scale: 1 }).width)} />}
        </Document>}
    </div>
  </div>;
}
