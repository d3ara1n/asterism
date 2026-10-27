import { useEffect, useState } from "react";
import { Button } from "@asterism/ui/ui/button";
import { startupMessages } from "../../shared/error-display";
import type { RecoveryPoint } from "../../shared/recovery";
import { useI18n } from "../shared/i18n";
import { FailureScreen, type FailureAction } from "./FailureScreen";
import type { StartupFailure } from "./StartupScreen";

const kindMessages = {
  migration: startupMessages.pointMigration,
  "before-restore": startupMessages.pointBeforeRestore,
  "before-fresh": startupMessages.pointBeforeFresh,
} as const;

/** The recovery page depends only on the desktop bridge; backend sessions and plugins have not started. Recovery points are listed newest first, and any can be restored. */
export function DataRecoveryScreen({ failure }: { failure: StartupFailure }) {
  const i18n = useI18n();
  const [current, setCurrent] = useState(failure);
  const [busy, setBusy] = useState(false);
  const [pointError, setPointError] = useState<string | null>(null);
  useEffect(() => window.host.startup.onChanged(state => {
    if (state.status === "failed" && state.reason === "data") setCurrent(state);
  }), []);
  const recovery = current.recovery;
  const actions: FailureAction[] = [
    { label: i18n.text(startupMessages.retryMigration), run: () => window.host.startup.recover({ kind: "retry" }) },
    { label: i18n.text(startupMessages.startFresh), run: () => window.host.startup.recover({ kind: "fresh" }) },
    { label: i18n.text(startupMessages.openData), run: () => window.host.startup.openDataDirectory() },
    { label: i18n.text(startupMessages.openLogs), run: () => window.host.openLogs() },
  ];
  const run = async (work: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(true); setPointError(null);
    try { setPointError(await work() || null); }
    catch (error) { setPointError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const describe = (point: RecoveryPoint) => [
    i18n.text(kindMessages[point.kind]),
    i18n.formatDate(Date.parse(point.createdAt), { dateStyle: "medium", timeStyle: "short" }),
    i18n.text({ ...startupMessages.pointVersion, values: { version: point.applicationVersion } }),
  ].join(" · ");
  return <FailureScreen title={i18n.text(startupMessages.recoveryTitle)}
    body={i18n.text(recovery?.paused ? startupMessages.pausedBody : startupMessages.recoveryBody)} actions={actions} details={current.detail}>
    {!!recovery?.points.length && <section className="space-y-2 text-left" aria-labelledby="recovery-points">
      <h2 id="recovery-points" className="type-section text-foreground">{i18n.text(startupMessages.recoveryPoints)}</h2>
      <ul className="space-y-2">
        {recovery.points.map(point => <li key={point.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="type-body truncate">{describe(point)}</p>
            {point.changes.length > 0 && <p className="type-caption truncate">
              {point.changes.map(change => `${change.id}: ${change.from} → ${change.to}`).join(", ")}
            </p>}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => { void run(() => window.host.startup.openRecoveryPoint(point.id)); }}>
              {i18n.text(startupMessages.openRecoveryPoint)}
            </Button>
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => { void run(() => window.host.startup.recover({ kind: "restore", point: point.id })); }}>
              {i18n.text(startupMessages.restorePoint)}
            </Button>
          </div>
        </li>)}
      </ul>
      {pointError && <p className="type-caption text-destructive">{pointError}</p>}
    </section>}
  </FailureScreen>;
}
