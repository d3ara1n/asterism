import { useEffect, useState } from "react";
import type { UiText } from "@atelier/sdk/contracts";
import { Alert, AlertDescription, AlertTitle } from "@atelier/ui/ui/alert";
import { Button } from "@atelier/ui/ui/button";
import { PageState } from "@atelier/ui/ui/page-state";
import { StatusIcon, StatusText } from "@atelier/ui/ui/status";
import { commonMessages } from "@atelier/ui/messages/common";
import { workbenchMessages as messages } from "../../messages/workbench";
import { useI18n } from "../../shared/i18n";
import type { WorkbenchPhase } from "./feedback";

/** 工作台只承接视图等待与读取异常；普通操作进度由发起处呈现。 */
export function WorkbenchFeedback({ phase, hasContent, error, onRetry }: {
  phase: WorkbenchPhase; hasContent: boolean; error: UiText | null; onRetry(): void;
}) {
  const i18n = useI18n();
  if (phase === "ready" || phase === "processing") return null;
  if (phase === "syncing" || phase === "starting") return <DelayedProgress key={phase} phase={phase} />;

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

/** 每段等待独立计时；恢复、失败或离开会话即卸载，短暂同步不闪现提示。 */
function DelayedProgress({ phase }: { phase: "syncing" | "starting" }) {
  const i18n = useI18n();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center" role="status">
    <div className="surface px-3 py-2">
      <StatusText tone="progress">{i18n.text(phase === "starting" ? messages.connecting : messages.syncing)}</StatusText>
    </div>
  </div>;
}
