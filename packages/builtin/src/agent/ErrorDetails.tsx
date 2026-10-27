import { useState } from "react";
import { Copy, FileText } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import type { ErrorDetails } from "@asterism-app/sdk/contracts";
import { JsonView } from "@asterism-app/ui/json-view";
import { Button } from "@asterism-app/ui/ui/button";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@asterism-app/ui/ui/dialog";
import { errorDetailMessages as messages } from "../messages/errors";

/** Transient feedback and historical notifications share details; response bodies are displayed verbatim, and copying includes the full cause chain. */
export function ExecutionErrorDetails({ code, details }: { code: string; details: ErrorDetails }) {
  const i18n = useI18n();
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copy = async () => {
    if (copying) return;
    setCopying(true); setCopyFailed(false);
    try { await navigator.clipboard.writeText(JSON.stringify({ category: code, error: details }, null, 2)); setCopied(true); }
    catch { setCopyFailed(true); }
    finally { setCopying(false); }
  };
  return <div className="flex flex-wrap items-center gap-2">
    {details.httpStatus !== undefined && <Badge variant="outline">HTTP {details.httpStatus}</Badge>}
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" size="xs"><FileText />{i18n.text(messages.view)}</Button></DialogTrigger>
      <DialogContent className="nodrag nopan nokey max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{i18n.text(messages.title)}{details.httpStatus !== undefined && ` · HTTP ${details.httpStatus}`}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap break-words select-text">{details.message}</DialogDescription>
        </DialogHeader>
        {(details.rawResponse !== undefined || details.rawEvent !== undefined) && <section className="space-y-2">
          <h3 className="type-label">{i18n.text(messages.raw)}</h3>
          <JsonView value={details.rawResponse ?? details.rawEvent} />
        </section>}
        {details.responseBody !== undefined && <section className="space-y-2">
          <h3 className="type-label">{i18n.text(messages.body)}</h3>
          <JsonView value={details.responseBody} />
        </section>}
        <section className="space-y-2">
          <h3 className="type-label">{i18n.text(messages.diagnostic)}</h3>
          <JsonView value={{ category: code, error: details }} />
        </section>
        {copyFailed && <p role="alert" className="type-caption text-destructive">{i18n.text(messages.copyFailed)}</p>}
        <DialogFooter showCloseButton>
          <Button variant="outline" disabled={copying} onClick={copy}><Copy />{i18n.text(copied ? messages.copied : messages.copy)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
