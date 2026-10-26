import { useEffect, useState } from "react";
import { startupMessages } from "../../shared/error-display";
import { useI18n } from "../shared/i18n";
import { FailureScreen, type FailureAction } from "./FailureScreen";
import type { StartupFailure } from "./StartupScreen";

/** 恢复页只依赖桌面桥，后台会话与插件尚未启动。 */
export function DataRecoveryScreen({ failure }: { failure: StartupFailure }) {
  const i18n = useI18n();
  const [current, setCurrent] = useState(failure);
  useEffect(() => window.host.startup.onChanged(state => {
    if (state.status === "failed" && state.reason === "data") setCurrent(state);
  }), []);
  const report = current.migration;
  const actions: FailureAction[] = [
    { label: i18n.text(startupMessages.retryMigration), run: () => window.host.startup.recover("retry") },
  ];
  if (report?.backupComplete) actions.push({ label: i18n.text(startupMessages.restoreBackup), run: () => window.host.startup.recover("restore") });
  if (report) actions.push({ label: i18n.text(startupMessages.startFresh), run: () => window.host.startup.recover("fresh") });
  if (report?.backup) actions.push({ label: i18n.text(startupMessages.openBackup), run: () => window.host.startup.openBackup() });
  actions.push(
    { label: i18n.text(startupMessages.openData), run: () => window.host.startup.openDataDirectory() },
    { label: i18n.text(startupMessages.openLogs), run: () => window.host.openLogs() },
  );
  const details = [current.detail, report?.backup && `Backup: ${report.backup}`,
    report?.operation && `Preserved files: ${report.operation.archive}`,
    ...report?.changes.map(change => `${change.id}: ${change.from} → ${change.to}`) ?? []].filter(Boolean).join("\n");
  return <FailureScreen title={i18n.text(startupMessages.recoveryTitle)}
    body={i18n.text(report?.status === "restored" ? startupMessages.restoredBody : startupMessages.recoveryBody)} actions={actions} details={details} />;
}
