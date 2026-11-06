import { Check, CircleArrowUp, Monitor, Moon, RefreshCw, Sun, SunMoon } from "lucide-react";
import type { RendererCommand, RendererCommandContext, RendererCommandGroup } from "@asterism-app/sdk/renderer";
import { Progress } from "@asterism-app/ui/ui/progress";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commandsMessages } from "../../messages/commands";
import { appearanceMessages } from "../../messages/appearance";
import { settingsMessages } from "../../messages/settings";
import { updatesMessages } from "../../messages/updates";
import { useI18n } from "../../shared/i18n";
import { useAppearance, useAppearanceAction, useAppearanceReadState } from "../appearance/state";
import { useUpdates } from "../updates/state";
import { useUpdateSummary } from "../updates/controls";

const themeOptions = [
  { mode: "system", label: appearanceMessages.system, Icon: Monitor },
  { mode: "light", label: appearanceMessages.light, Icon: Sun },
  { mode: "dark", label: appearanceMessages.dark, Icon: Moon },
] as const;

function useThemeCommand(): RendererCommand {
  const i18n = useI18n();
  const appearance = useAppearance();
  const { ready, error } = useAppearanceReadState();
  const { busy, save } = useAppearanceAction();
  const current = themeOptions.find(option => option.mode === appearance.mode)!;
  // The row names the setting; the detail states its saved value once, and the nested page marks it with a check.
  return {
    id: "theme", label: commandsMessages.theme,
    icon: busy ? <Spinner /> : <SunMoon />, disabled: !ready || busy,
    keywords: [appearanceMessages.mode, ...themeOptions.map(option => option.label)].map(message => i18n.text(message)),
    detail: error ? <span className="text-destructive">{i18n.text(error)}</span> : i18n.text(current.label),
    children: themeOptions.map(({ mode, label, Icon }) => ({
      id: mode, label, icon: <Icon />, current: appearance.mode === mode,
      onAction: () => { if (mode !== appearance.mode) void save({ mode }); },
    })),
  };
}

function useUpdateCommand(): RendererCommand {
  const i18n = useI18n();
  const { state, failure, checking, installing, check, install } = useUpdates();
  const summary = useUpdateSummary();
  const ready = state?.status === "ready";
  const downloading = state?.status === "downloading";
  const busy = checking || installing;
  const detail = failure?.detail ?? state?.error;
  return {
    id: "updates", label: ready ? updatesMessages.install : installing ? updatesMessages.restarting : updatesMessages.check,
    keywords: [i18n.text(updatesMessages.title), i18n.text(updatesMessages.check), i18n.text(updatesMessages.install)],
    icon: busy ? <Spinner /> : ready ? <CircleArrowUp /> : state?.status === "current" ? <Check /> : <RefreshCw />,
    disabled: state?.enabled === false || busy,
    detail: <div className="flex min-w-0 flex-col gap-1.5" role="status">
      <span className="flex items-center gap-2">
        <span className={failure || state?.status === "error" ? "text-destructive" : undefined}>{summary}</span>
        {state?.availableVersion && <span className="tabular-nums">{state.availableVersion}</span>}
        {downloading && <span className="ml-auto tabular-nums">{i18n.formatNumber(Math.floor(state.progress) / 100, { style: "percent" })}</span>}
      </span>
      {downloading && <Progress value={state.progress} aria-label={i18n.text(updatesMessages.downloading)} className="h-1" />}
      {detail && <span className="break-words text-destructive">{detail}</span>}
    </div>,
    // Update work belongs to the application service and continues when the palette closes.
    onAction: () => { void (ready ? install() : check()); },
  };
}

export const settingsCommands: RendererCommandGroup = {
  id: "settings", label: settingsMessages.settings,
  useCommands(_context: RendererCommandContext) {
    return [useThemeCommand(), useUpdateCommand()];
  },
};
