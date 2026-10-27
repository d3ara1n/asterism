import { Button } from "@asterism-app/ui/ui/button";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { ExternalLink } from "lucide-react";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { updatesMessages as messages } from "../../messages/updates";
import { useI18n } from "../../shared/i18n";
import { useUpdates } from "./state";

export function useUpdateSummary() {
  const i18n = useI18n();
  const { state, failure } = useUpdates();
  if (failure) return i18n.text(failure.kind === "load" ? messages.loadFailed : messages.failed);
  if (!state) return "";
  const message = !state.enabled ? messages.unavailable
    : state.status === "error" ? messages.failed : messages[state.status];
  return i18n.formatMessage(message, { version: state.availableVersion ?? "", percent: Math.floor(state.progress) });
}

export function UpdateAction() {
  const i18n = useI18n();
  const { state, failure, checking, installing, check, install } = useUpdates();
  if (state?.status === "ready") return <Button size="sm" disabled={installing} onClick={() => void install()}>
    {i18n.text(messages.install)}
  </Button>;
  return <Button size="sm" variant="outline" disabled={state?.enabled === false || checking}
    onClick={() => void check()}>
    {i18n.text(failure || state?.status === "error" ? commonMessages.retry : messages.check)}
  </Button>;
}

export function UpdateError() {
  const i18n = useI18n();
  const { state, failure } = useUpdates();
  const detail = failure?.detail ?? state?.error;
  if (!detail) return null;
  return <Alert variant="destructive"><AlertDescription>
    {i18n.text(failure?.kind === "load" ? messages.loadFailed : messages.failed)}
    <details className="mt-2">
      <summary>{i18n.text(messages.details)}</summary>
      <pre className="mt-1 whitespace-pre-wrap break-all text-xs">{detail}</pre>
    </details>
  </AlertDescription></Alert>;
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
