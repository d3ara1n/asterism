import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CircleArrowUp, ExternalLink, type LucideIcon } from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import { Progress } from "@asterism-app/ui/ui/progress";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { StatusIcon, type StatusTone } from "@asterism-app/ui/ui/status";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { cn } from "@asterism-app/ui/utils";
import { updatesMessages as messages } from "../../messages/updates";
import { useI18n } from "../../shared/i18n";
import { fadeTransition } from "../../shared/weave/motion";
import { useUpdates } from "./state";

type UpdateStatusView = { key: string; tone: StatusTone; label: string; icon?: LucideIcon };

/** Status as a tone and short label; failures take precedence over the reported state, and pending installation reads as restarting. */
function useUpdateStatus(): UpdateStatusView | null {
  const i18n = useI18n();
  const { state, failure, installing } = useUpdates();
  if (failure) return { key: "error", tone: "error", label: i18n.text(failure.kind === "load" ? messages.loadFailed : messages.failed) };
  if (installing) return { key: "restarting", tone: "progress", label: i18n.text(messages.restarting) };
  if (!state) return null;
  if (!state.enabled) return { key: "unavailable", tone: "neutral", label: i18n.text(messages.unavailable) };
  const status = state.status;
  const tone: StatusTone = status === "error" ? "error" : status === "checking" || status === "downloading" || status === "restarting" ? "progress"
    : status === "current" || status === "ready" ? "success" : "neutral";
  return { key: status, tone, label: i18n.text(messages[status === "error" ? "failed" : status]), icon: status === "ready" ? CircleArrowUp : undefined };
}

function useProgress() {
  const i18n = useI18n();
  const { state, failure } = useUpdates();
  return state?.status === "downloading" && !failure
    ? { value: state.progress, label: i18n.formatNumber(Math.floor(state.progress) / 100, { style: "percent" }) } : null;
}

/** One-line status for tooltips and accessible names. */
export function useUpdateSummary() {
  const status = useUpdateStatus();
  const progress = useProgress();
  if (!status) return "";
  return progress ? `${status.label} ${progress.label}` : status.label;
}

/** Current version, followed by the target version when one is available. */
export function UpdateVersions({ compact = false }: { compact?: boolean }) {
  const i18n = useI18n();
  const { state } = useUpdates();
  const size = compact ? "type-page tabular-nums" : "type-display";
  return <p className={cn("flex flex-wrap items-center gap-y-1", compact ? "gap-x-2" : "gap-x-3")}>
    <span className={size}>{state?.version ?? "…"}</span>
    {state?.availableVersion && <>
      <ArrowRight className={cn("shrink-0 text-muted-foreground", compact ? "size-4" : "size-5")} aria-hidden="true" />
      <span className="sr-only">{i18n.text(messages.nextVersion)}</span>
      <span className={cn(size, "text-primary-text")}>{state.availableVersion}</span>
    </>}
  </p>;
}

/** Status row, download progress, folded error detail, and release notes; content follows the current state. Ready and restarting omit the status row because the action button carries that state. */
export function UpdateStatus() {
  const i18n = useI18n();
  const { state, failure } = useUpdates();
  const status = useUpdateStatus();
  const progress = useProgress();
  const detail = failure?.detail ?? state?.error;
  return <div className="space-y-2">
    <div role="status" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {status && status.key !== "ready" && status.key !== "restarting" && <motion.p key={status.key} className="type-body flex min-h-5 items-center gap-2"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition}>
          <StatusIcon tone={status.tone} icon={status.icon} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{status.label}</span>
          {progress && <span className="tabular-nums text-muted-foreground">{progress.label}</span>}
        </motion.p>}
      </AnimatePresence>
    </div>
    {progress && <Progress value={progress.value} aria-label={i18n.text(messages.title)} className="h-1.5" />}
    {detail && <details className="type-caption">
      <summary className="cursor-pointer hover:text-foreground">{i18n.text(messages.details)}</summary>
      <pre className="mt-1 whitespace-pre-wrap break-all">{detail}</pre>
    </details>}
    <UpdateNotesLink />
  </div>;
}

export function UpdateAction() {
  const i18n = useI18n();
  const { state, failure, checking, installing, check, install } = useUpdates();
  if (state?.status === "ready" || installing) return <Button size="sm" disabled={installing} aria-busy={installing} onClick={() => void install()}>
    {installing && <Spinner data-icon="inline-start" />}
    {i18n.text(installing ? messages.restarting : messages.install)}
  </Button>;
  return <Button size="sm" variant="outline" disabled={state?.enabled === false || checking}
    onClick={() => void check()}>
    {i18n.text(failure || state?.status === "error" ? commonMessages.retry : messages.check)}
  </Button>;
}

/** View release notes for the target version on its GitHub Release page; the window-open handler delegates to the system browser. */
export function UpdateNotesLink() {
  const i18n = useI18n();
  const { state } = useUpdates();
  if (!state?.releaseUrl) return null;
  return <a href={state.releaseUrl} target="_blank" rel="noreferrer"
    className="type-caption inline-flex items-center gap-1 self-start hover:text-foreground">
    {i18n.text(messages.releaseNotes)}<ExternalLink className="size-3" aria-hidden="true" />
  </a>;
}
