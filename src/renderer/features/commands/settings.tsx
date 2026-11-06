import { Check, CircleArrowUp, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import type { RendererCommand, RendererCommandContext, RendererCommandGroup } from "@asterism-app/sdk/renderer";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { Progress } from "@asterism-app/ui/ui/progress";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commandsMessages } from "../../messages/commands";
import { appearanceMessages } from "../../messages/appearance";
import { settingsMessages } from "../../messages/settings";
import { updatesMessages } from "../../messages/updates";
import { useI18n } from "../../shared/i18n";
import { useAppearance, useAppearanceAction, useAppearanceReadState } from "../appearance/state";
import type { Appearance } from "../../../shared/theme";
import { useUpdates } from "../updates/state";
import { useUpdateSummary } from "../updates/controls";

function useThemeCommand(): RendererCommand {
  const i18n = useI18n();
  const appearance = useAppearance();
  const { ready, error } = useAppearanceReadState();
  const { busy, save } = useAppearanceAction();
  return {
    id: "theme", label: commandsMessages.theme,
    icon: appearance.mode === "system" ? <Monitor /> : appearance.mode === "dark" ? <Moon /> : <Sun />, disabled: !ready || busy,
    keywords: [appearanceMessages.mode, appearanceMessages.system, appearanceMessages.light, appearanceMessages.dark].map(message => i18n.text(message)),
    detail: error ? <span className="text-destructive">{i18n.text(error)}</span> : undefined,
    control: <ToggleGroup type="single" variant="outline" size="sm" value={appearance.mode}
      disabled={!ready || busy} aria-label={i18n.text(commandsMessages.theme)}
      onValueChange={mode => { if (mode) void save({ mode: mode as Appearance["mode"] }); }}>
      <ToggleGroupItem value="system" className="px-2"><Monitor />{i18n.text(appearanceMessages.system)}</ToggleGroupItem>
      <ToggleGroupItem value="light" className="px-2"><Sun />{i18n.text(appearanceMessages.light)}</ToggleGroupItem>
      <ToggleGroupItem value="dark" className="px-2"><Moon />{i18n.text(appearanceMessages.dark)}</ToggleGroupItem>
    </ToggleGroup>,
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
