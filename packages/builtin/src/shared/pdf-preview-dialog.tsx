import { Component, lazy, Suspense, type ReactNode } from "react";
import { Download } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@asterism-app/ui/ui/dialog";
import { Button } from "@asterism-app/ui/ui/button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { mediaMessages as messages } from "../messages/media";

const PdfPreview = lazy(() => import("./pdf-preview"));

class PreviewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function PdfPreviewDialog({ onOpenChange, name, details, openFile, saving, save }: {
  onOpenChange(open: boolean): void; name: string; details: string; openFile(): AsyncIterable<Uint8Array>; saving: boolean; save(): void;
}) {
  const i18n = useI18n();
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="h-[90vh] max-w-[min(90vw,80rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[min(90vw,80rem)]">
      <DialogHeader><DialogTitle className="break-all">{name}</DialogTitle><DialogDescription>{details}</DialogDescription></DialogHeader>
      <PreviewBoundary fallback={<p role="alert">{i18n.text(messages.unavailable)}</p>}>
        <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
          <PdfPreview openFile={openFile} />
        </Suspense>
      </PreviewBoundary>
      <div className="flex justify-end"><Button variant="outline" disabled={saving} onClick={save}>
        {saving ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}{i18n.text(messages.saveAs)}
      </Button></div>
    </DialogContent>
  </Dialog>;
}
