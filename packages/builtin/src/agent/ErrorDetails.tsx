import { useState } from "react";
import { Copy, FileText } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import type { ErrorDetails } from "@asterism-app/sdk/contracts";
import { JsonView } from "@asterism-app/ui/json-view";
import { Button } from "@asterism-app/ui/ui/button";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@asterism-app/ui/ui/dialog";
import { errorDetailMessages as messages } from "../messages/errors";

/** Transient and historical inline feedback share details; response bodies are displayed verbatim, and copying includes the full cause chain. */
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
      <DialogContent className="nodrag nopan nokey flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>{i18n.text(messages.title)}{details.httpStatus !== undefined && ` · HTTP ${details.httpStatus}`}</DialogTitle>
        </DialogHeader>
        <div tabIndex={0} role="region" aria-label={i18n.text(messages.title)}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-2 outline-offset-[-2px]">
          <div className="flex min-w-0 flex-col gap-5 select-text">
            <DialogDescription className="whitespace-pre-wrap wrap-anywhere">{details.message}</DialogDescription>
            {(details.rawResponse !== undefined || details.rawEvent !== undefined) && <section className="flex min-w-0 flex-col gap-2">
              <h3 className="type-label">{i18n.text(messages.raw)}</h3>
              <JsonView className="max-h-none overflow-visible" value={details.rawResponse ?? details.rawEvent} />
            </section>}
            {details.responseBody !== undefined && <section className="flex min-w-0 flex-col gap-2">
              <h3 className="type-label">{i18n.text(messages.body)}</h3>
              <JsonView className="max-h-none overflow-visible" value={details.responseBody} />
            </section>}
            <section className="flex min-w-0 flex-col gap-2">
              <h3 className="type-label">{i18n.text(messages.diagnostic)}</h3>
              <JsonView className="max-h-none overflow-visible" value={{ category: code, error: details }} />
            </section>
          </div>
        </div>
        <DialogFooter className="shrink-0 sm:items-center">
          {copyFailed && <p role="alert" className="type-caption text-destructive sm:mr-auto">{i18n.text(messages.copyFailed)}</p>}
          <Button variant="outline" disabled={copying} onClick={copy}><Copy />{i18n.text(copied ? messages.copied : messages.copy)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
