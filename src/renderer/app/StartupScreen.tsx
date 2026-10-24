import { useState } from "react";
import type { UiText } from "@atelier/sdk/contracts";
import { startupMessages } from "../../shared/error-display";
import { useI18n } from "../shared/i18n";
import { FailureScreen, type FailureAction } from "./FailureScreen";

export interface StartupFailure {
  reason: "initialization" | "database_version" | "timeout" | "runtime";
  detail: string;
}

/** 等待指示延迟显现的时长，与 styles.css 中 `.startup-reveal` 一致；快速启动不闪现加载画面。 */
const REVEAL_DELAY_MS = 300;

/** 启动页独立于工作台和插件，等待与失败共用同一窗口。 */
export function StartupScreen({ stage, detail, failure }: { stage: UiText; detail?: string; failure?: StartupFailure }) {
  const i18n = useI18n();
  // 静态占位的显现动画从页面载入开始计时；React 接管后按已过时间续接，不重新等待。
  const [revealDelay] = useState(() => REVEAL_DELAY_MS - performance.now());
  if (failure) {
    const actions: FailureAction[] = [
      { label: i18n.text(startupMessages.restart), run: () => window.host.startup.restart() },
      { label: i18n.text(startupMessages.openLogs), run: () => window.host.openLogs() },
    ];
    if (failure.reason === "database_version")
      actions.push({ label: i18n.text(startupMessages.openData), run: () => window.host.startup.openDataDirectory() });
    return <FailureScreen title={i18n.text(startupMessages.failed)} actions={actions} details={failure.detail}
      body={i18n.text(failure.reason === "database_version" ? startupMessages.databaseVersion
        : failure.reason === "timeout" ? startupMessages.timedOut : startupMessages.failedBody)} />;
  }
  return <main className="startup-screen">
    <div className="startup-content startup-reveal" role="status" aria-live="polite"
      style={{ animationDelay: `${revealDelay}ms` }}>
      <div className="startup-indicator" aria-hidden="true" />
      <p className="startup-stage">{i18n.text(stage)}</p>
      {detail && <p className="type-caption break-words">{detail}</p>}
    </div>
  </main>;
}
