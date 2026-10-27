import type { UiText } from "@asterism/sdk/contracts";
import { Alert, AlertDescription, AlertTitle } from "@asterism/ui/ui/alert";
import { Button } from "@asterism/ui/ui/button";
import { PageState } from "@asterism/ui/ui/page-state";
import { StatusIcon, StatusText } from "@asterism/ui/ui/status";
import { commonMessages } from "@asterism/ui/messages/common";
import { workbenchMessages as messages } from "../../messages/workbench";
import { useI18n } from "../../shared/i18n";
import type { WorkbenchPhase } from "./feedback";

/** The workbench handles only view waiting and read errors; ordinary operation progress is displayed at the initiating entry. */
export function WorkbenchFeedback({ phase, hasContent, error, onRetry }: {
  phase: WorkbenchPhase; hasContent: boolean; error: UiText | null; onRetry(): void;
}) {
  const i18n = useI18n();
  if (phase === "ready") return null;
  if (phase === "loading" || phase === "starting") return <div className="absolute inset-0 flex items-center justify-center" role="status">
    <StatusText tone="progress">{i18n.text(phase === "starting" ? messages.connecting : messages.syncing)}</StatusText>
  </div>;

  const unavailable = phase === "unavailable";
  const title = i18n.text(unavailable ? messages.serviceUnavailable : hasContent ? messages.updateFailed : messages.loadFailed);
  const description = unavailable ? i18n.text(commonMessages.runtimeStopped)
    : hasContent ? i18n.text(messages.staleContent) : i18n.text(commonMessages.unavailableBody);
  const errorText = error ? i18n.text(error) : null;
  const detail = errorText === description ? null : errorText;
  const action = unavailable ? undefined
    : <Button variant="outline" size="sm" onClick={onRetry}>{i18n.text(commonMessages.retry)}</Button>;

  if (!hasContent) return <div className="absolute inset-0 flex items-center justify-center p-6">
    <PageState kind="error" title={title} body={detail ? `${description} ${detail}` : description} action={action} />
  </div>;

  return <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center">
    <Alert variant="destructive" className="pointer-events-auto max-w-xl">
      <StatusIcon tone="error" />
      <AlertTitle className="line-clamp-none">{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {detail && <p className="max-h-32 overflow-y-auto break-words">{detail}</p>}
        {action}
      </AlertDescription>
    </Alert>
  </div>;
}
