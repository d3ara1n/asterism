import { useEffect, useRef, useState, type ReactNode } from "react";
import { IslandPanel, useI18n } from "@asterism-app/sdk/renderer";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { editorMessages as messages } from "../messages/editor";

/** An independent content surface using the same island shell as the text editor. */
export default function ImageViewer({ path, mediaType, base64, source }: { path: string; mediaType: string; base64: string; source?: ReactNode }) {
  const i18n = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setArea({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, []);
  const fit = dimensions.width && dimensions.height
    ? Math.min(1, area.width / dimensions.width, area.height / dimensions.height) : 1;
  const scale = zoom ?? fit;
  return <IslandPanel title={path} source={source} layout="fill" action={<>
    <IconButton label={i18n.text(commonMessages.zoomOut)} disabled={scale <= 0.1} onClick={() => setZoom(Math.max(0.1, scale / 1.25))}><Minus /></IconButton>
    <Button size="sm" variant="ghost" aria-label={i18n.text(messages.actualSize)} onClick={() => setZoom(1)}>{Math.round(scale * 100)}%</Button>
    <IconButton label={i18n.text(commonMessages.zoomIn)} disabled={scale >= 8} onClick={() => setZoom(Math.min(8, scale * 1.25))}><Plus /></IconButton>
    <IconButton label={i18n.text(messages.fitImage)} onClick={() => setZoom(null)}><Maximize /></IconButton>
  </>}>
    {failed && <Alert variant="destructive"><AlertDescription>{i18n.text(messages.imageFailed)}</AlertDescription></Alert>}
    <div ref={viewport} className="min-h-0 flex-1 overflow-auto overscroll-contain bg-muted/30">
      <div className="flex h-max min-h-full w-max min-w-full items-center justify-center">
        {!dimensions.width && !failed && <span role="status" aria-label={i18n.text(commonMessages.loading)}><Spinner /></span>}
        <img src={`data:${mediaType};base64,${base64}`} alt={path} draggable={false}
          style={{ width: dimensions.width ? dimensions.width * scale : undefined, maxWidth: "none", visibility: dimensions.width ? "visible" : "hidden" }}
          onLoad={event => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => setFailed(true)} />
      </div>
    </div>
    <footer className="type-caption shrink-0 border-t px-3 py-1.5 text-muted-foreground">
      {dimensions.width > 0 && `${dimensions.width} × ${dimensions.height} · `}{mediaType}
    </footer>
  </IslandPanel>;
}
