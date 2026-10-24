import { useState } from "react";
import type { UiText } from "@atelier/sdk/contracts";
import { Button } from "@atelier/ui/ui/button";
import { startupMessages } from "../../shared/error-display";
import { useI18n } from "../shared/i18n";

export interface StartupFailure {
  reason: "initialization" | "database_version" | "timeout" | "runtime";
  detail: string;
}

/** 启动页独立于工作台和插件，等待与失败共用同一窗口。 */
export function StartupScreen({ stage, detail, failure }: { stage: UiText; detail?: string; failure?: StartupFailure }) {
  const i18n = useI18n();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(true); setActionError(null);
    try { setActionError(await action() || null); }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <main className="startup-screen">
    {failure ? <section className="startup-content space-y-4" role="alert">
      <h1 className="type-page text-foreground">{i18n.text(startupMessages.failed)}</h1>
      <p className="type-body">{i18n.text(failure.reason === "database_version" ? startupMessages.databaseVersion
        : failure.reason === "timeout" ? startupMessages.timedOut : startupMessages.failedBody)}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button disabled={busy} onClick={() => { void run(() => window.host.startup.restart()); }}>{i18n.text(startupMessages.restart)}</Button>
        <Button variant="outline" disabled={busy} onClick={() => { void run(() => window.host.openLogs()); }}>{i18n.text(startupMessages.openLogs)}</Button>
        {failure.reason === "database_version" && <Button variant="outline" disabled={busy}
          onClick={() => { void run(() => window.host.startup.openDataDirectory()); }}>{i18n.text(startupMessages.openData)}</Button>}
      </div>
      <details className="text-left">
        <summary>{i18n.text(startupMessages.details)}</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words select-text type-caption">{failure.detail}</pre>
      </details>
      {actionError && <p className="type-caption text-destructive">{actionError}</p>}
    </section> : <div className="startup-content flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className="startup-indicator" aria-hidden="true" />
      <p className="startup-stage">{i18n.text(stage)}</p>
      {detail && <p className="type-caption break-all">{detail}</p>}
    </div>}
  </main>;
}
