import { useState } from "react";
import type { UiText } from "@asterism/sdk/contracts";
import { startupMessages } from "../../shared/error-display";
import { useI18n } from "../shared/i18n";
import { FailureScreen, type FailureAction } from "./FailureScreen";
import type { StartupState } from "../../shared/startup";
import { DataRecoveryScreen } from "./DataRecoveryScreen";

export type StartupFailure = Omit<Extract<StartupState, { status: "failed" }>, "status">;

/** Delay before the waiting indicator appears, matching `.startup-reveal` in styles.css; fast startups do not flash a loading screen. */
const REVEAL_DELAY_MS = 300;

/** The startup page is independent of the workbench and plugins; waiting and failure share the same window. */
export function StartupScreen({ stage, detail, failure }: { stage: UiText; detail?: string; failure?: StartupFailure }) {
  const i18n = useI18n();
  // The static placeholder reveal animation starts at page load; React continues from the elapsed time when taking over, without restarting the wait.
  const [revealDelay] = useState(() => REVEAL_DELAY_MS - performance.now());
  if (failure?.reason === "data") return <DataRecoveryScreen failure={failure} />;
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
