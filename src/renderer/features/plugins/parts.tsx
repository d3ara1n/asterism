import { useState } from "react";
import type { UiMessage } from "@asterism-app/sdk/contracts";
import type { I18n } from "@asterism-app/sdk/renderer";
import type { StatusTone } from "@asterism-app/ui/ui/status";
import { cn } from "@asterism-app/ui/utils";
import type { PluginEntry } from "../../../shared/contracts";
import { pluginName } from "../../../shared/plugin-name";
import type { RendererOutcome } from "../../modules/plugin-outcome";
import { pluginsMessages as messages } from "../../messages/plugins";
import { useI18n } from "../../shared/i18n";
import type { PluginChange, PluginCondition, PluginView } from "./model";

export const conditions: Record<PluginCondition, { tone: StatusTone; label: UiMessage }> = {
  running: { tone: "success", label: messages.running },
  interfacePartial: { tone: "warning", label: messages.partial },
  interfaceFailed: { tone: "error", label: messages.frontendFailed },
  failed: { tone: "error", label: messages.failed },
  invalid: { tone: "error", label: messages.invalidPackage },
  disabled: { tone: "neutral", label: messages.disabled },
  notRunning: { tone: "neutral", label: messages.notRunning },
};
export const changes: Record<PluginChange, UiMessage> = {
  add: messages.changeAdd, enable: messages.changeEnable, disable: messages.changeDisable, remove: messages.changeRemove, update: messages.changeUpdate,
};
export const originLabels: Record<PluginEntry["origin"]["kind"], UiMessage> = {
  bundled: messages.bundledSource, path: messages.localSource, npm: messages.npmSource,
};
const stages = { discovery: messages.discoveryStage, build: messages.buildStage, storage: messages.storageStage, import: messages.importStage,
  setup: messages.setupStage, validation: messages.validationStage, dependency: messages.dependencyStage, style: messages.styleStage,
  prepare: messages.prepareStage, module: messages.moduleStage };

/** Startup, package-information, and frontend failures with their stages, one per line. */
export function pluginDiagnostics(view: PluginView, renderers: ReadonlyMap<string, RendererOutcome>, i18n: I18n): string[] {
  const { entry } = view;
  const lines: string[] = [];
  const startup = entry.startup?.diagnostic;
  if (startup) lines.push(i18n.formatMessage(messages.diagnostic, { stage: i18n.text(stages[startup.stage]), message: startup.message }));
  if (entry.metadataError) lines.push(i18n.formatMessage(messages.metadataFailed, { message: entry.metadataError }));
  if (entry.startup?.status === "loaded" && entry.id) for (const diagnostic of renderers.get(entry.id)?.diagnostics ?? []) {
    lines.push(i18n.formatMessage(messages.diagnostic, {
      stage: diagnostic.module === undefined ? i18n.text(stages[diagnostic.stage]) : i18n.formatMessage(messages.moduleNumber, { number: diagnostic.module + 1 }),
      message: diagnostic.message,
    }));
  }
  return lines;
}

/** The version the next startup uses: the managed exact version, or the package's declared version. */
export function selectedVersion(entry: PluginEntry): string | null {
  return entry.origin.kind === "npm" ? entry.origin.version : entry.metadata.version ?? null;
}

/** The package icon, or the first letter of the plugin name on a neutral tile. */
export function PluginIcon({ entry, size = "md", className }: { entry: PluginEntry; size?: "md" | "lg"; className?: string }) {
  const i18n = useI18n();
  const [broken, setBroken] = useState(false);
  const frame = size === "lg" ? "size-12 rounded-xl text-lg" : "size-8 rounded-lg text-sm";
  if (entry.metadata.icon && !broken) return <img src={entry.metadata.icon} alt="" draggable={false} onError={() => setBroken(true)}
    className={cn(frame, "shrink-0 object-contain", className)} />;
  const initial = Array.from(i18n.text(pluginName(entry)).trim())[0]?.toLocaleUpperCase() ?? "?";
  return <span aria-hidden="true" className={cn(frame, "flex shrink-0 select-none items-center justify-center border bg-muted font-semibold text-muted-foreground", className)}>
    {initial}
  </span>;
}

/** Restart through the host; the quit confirmation may cancel, after which the action becomes available again. */
export function useRestart() {
  const [restarting, setRestarting] = useState(false);
  const restart = () => {
    setRestarting(true);
    void window.host.startup.restart().finally(() => setRestarting(false));
  };
  return { restart, restarting };
}
