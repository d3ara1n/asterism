import type { StartupState } from "../../shared/startup";
import { startupMessages } from "../../shared/error-display";
import { useI18n } from "../shared/i18n";
import { FailureScreen, type FailureAction } from "./FailureScreen";
import { DataRecoveryScreen } from "./DataRecoveryScreen";

export type StartupFailure = Omit<Extract<StartupState, { status: "failed" }>, "status">;

/** Startup failures are independent of the workbench and plugins; waiting is presented by the static startup splash. */
export function StartupScreen({ failure }: { failure: StartupFailure }) {
  const i18n = useI18n();
  if (failure.reason === "data") return <DataRecoveryScreen failure={failure} />;
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
