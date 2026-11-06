import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import {
  Autocomplete, GridList, GridListHeader, GridListItem, GridListSection, Input, SearchField,
} from "react-aria-components";
import { Search } from "lucide-react";
import {
  RendererCallsProvider, RendererPreferencesProvider, useRendererCalls,
  type RendererCalls, type RendererPreferences, type RendererCommand, type RendererCommandContext, type RendererCommandGroup, type RendererSessionSnapshot,
} from "@asterism-app/sdk/renderer";
import { Dialog, DialogContent, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { cn } from "@asterism-app/ui/utils";
import { matchesCommandText } from "@asterism-app/ui/command-filter";
import { commandDetail, commandEmpty, commandHeading, commandRow } from "@asterism-app/ui/command-styles";
import { commandsMessages as messages } from "../../messages/commands";
import { usePluginCommands, type RegisteredCommandGroup } from "../../modules/commands";
import { useI18n } from "../../shared/i18n";
import { PluginCallScope, SettingsBoundary } from "../plugins/scope";
import { pluginPreferences } from "../creation/preferences";
import { settingsCommands } from "./settings";

/** One command is either a row action or a row containing independently focusable controls. */
function CommandRow({ id, command, heading, calls, preferences }: {
  id: string; command: RendererCommand; heading: string; calls: RendererCalls; preferences?: RendererPreferences;
}) {
  const i18n = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const detailId = useId();
  const label = i18n.text(command.label);
  const focusControl = () => ref.current?.querySelector<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex="0"]',
  )?.focus();
  let content = <>
    {command.icon && <span className="shrink-0 text-muted-foreground" aria-hidden="true">{command.icon}</span>}
    <div className="min-w-0 flex-1">
      <div className="truncate">{label}</div>
      {command.detail && <div id={detailId} className={cn("mt-0.5", commandDetail)}>{command.detail}</div>}
    </div>
    {command.control && <fieldset aria-label={label} disabled={command.disabled} className="min-w-0 shrink-0"
      onClick={event => event.stopPropagation()}>{command.control}</fieldset>}
  </>;
  // Collection content renders outside its declaration's providers; bind plugin UI to the same capabilities explicitly.
  if (preferences) content = <SettingsBoundary fallback={<span className="text-destructive">{i18n.text(messages.pluginFailed)}</span>}>
    <RendererPreferencesProvider value={preferences}><PluginCallScope>{content}</PluginCallScope></RendererPreferencesProvider>
  </SettingsBoundary>;
  return <GridListItem ref={ref} id={id} textValue={[label, heading, ...command.keywords ?? []].join(" ")}
    aria-label={label} aria-describedby={command.detail ? detailId : undefined}
    isDisabled={command.disabled} data-command-row
    onAction={command.onAction ?? focusControl}
    className={cn(commandRow, "transition-colors",
      "data-[default]:bg-accent data-[hovered]:bg-accent data-[focused]:bg-accent data-[default]:text-accent-foreground data-[focused]:text-accent-foreground",
      "data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/50 data-[focus-visible]:ring-inset",
      "data-[disabled]:opacity-50",
      "[&_svg]:size-4 [&_svg]:shrink-0")}>
    <RendererCallsProvider value={calls}>{content}</RendererCallsProvider>
  </GridListItem>;
}

/** React Aria collects these sections through custom components, so contributions can own their hooks and local state. */
function CommandSection({ group, context, namespace, heading, preferences }: {
  group: RendererCommandGroup; context: RendererCommandContext; namespace: string; heading?: string; preferences?: RendererPreferences;
}) {
  const i18n = useI18n();
  const calls = useRendererCalls();
  const commands = group.useCommands(context);
  const ids = new Set<string>();
  for (const command of commands) {
    if (!command.id.trim() || command.id !== command.id.trim() || ids.has(command.id))
      throw new Error("Command IDs must be unique non-empty trimmed strings within their group.");
    ids.add(command.id);
  }
  const visible = commands.filter(command => command.when !== false);
  if (!visible.length) return null;
  return <GridListSection id={namespace}>
    <GridListHeader className={commandHeading}>{heading ?? i18n.text(group.label)}</GridListHeader>
    {visible.map(command => <CommandRow key={command.id} id={JSON.stringify([namespace, command.id])}
      command={command} heading={heading ?? i18n.text(group.label)} calls={calls} preferences={preferences} />)}
  </GridListSection>;
}

function PluginSection({ group, context }: { group: RegisteredCommandGroup; context: RendererCommandContext }) {
  const i18n = useI18n();
  const namespace = JSON.stringify([group.pluginId, group.id]);
  const heading = `${i18n.text(group.pluginName)} · ${i18n.text(group.label)}`;
  const preferences = useMemo(() => pluginPreferences(group.pluginId), [group.pluginId]);
  return <SettingsBoundary fallback={<GridListSection id={namespace}>
    <GridListHeader className={commandHeading}>{heading}</GridListHeader>
    <GridListItem id={`${namespace}/failed`} textValue={heading} isDisabled className={cn(commandRow, "text-destructive")}>
      {i18n.text(messages.pluginFailed)}
    </GridListItem>
  </GridListSection>}>
    <RendererPreferencesProvider value={preferences}><PluginCallScope>
      <CommandSection group={group} context={context} namespace={namespace} heading={heading} preferences={preferences} />
    </PluginCallScope></RendererPreferencesProvider>
  </SettingsBoundary>;
}

const rowSelector = '[data-command-row]:not([aria-disabled="true"])';

/** Rows keep real DOM focus so inline controls work, which leaves no virtual highlight while typing.
 *  Mark the row that Enter would run, tracking filtering and availability changes from any section. */
function useDefaultRow(grid: HTMLElement | null, active: boolean) {
  useEffect(() => {
    if (!grid) return;
    const mark = () => {
      const target = active ? grid.querySelector<HTMLElement>(rowSelector) : null;
      for (const row of grid.querySelectorAll<HTMLElement>("[data-default]")) if (row !== target) row.removeAttribute("data-default");
      target?.setAttribute("data-default", "");
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(grid, { subtree: true, childList: true, attributeFilter: ["aria-disabled"] });
    return () => { observer.disconnect(); for (const row of grid.querySelectorAll("[data-default]")) row.removeAttribute("data-default"); };
  }, [grid, active]);
}

/** The modifier beside Space: Command on macOS, Alt elsewhere, where the system reserves the Windows/Super key.
 *  Ctrl+K stays with the focused Agent view on every platform. */
const mac = window.host.platform === "darwin";
export const applicationCommandsShortcut = mac ? "⌘K" : "Alt+K";
function isApplicationChord(event: KeyboardEvent) {
  return (mac ? event.metaKey && !event.altKey : event.altKey && !event.metaKey)
    && !event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "k";
}

/** Application modal opened from the menu or the application chord. */
export function ApplicationCommands({ open, onOpenChange, session, ready, returnFocus }: {
  open: boolean; onOpenChange(open: boolean): void; session: RendererSessionSnapshot | null; ready: boolean;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const i18n = useI18n();
  const groups = usePluginCommands();
  const input = useRef<HTMLInputElement>(null);
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const [searching, setSearching] = useState(false);
  useDefaultRow(grid, open && searching);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const context = useMemo<RendererCommandContext>(() => ({ session, ready, close }), [session, ready, close]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || !isApplicationChord(event)) return;
      event.preventDefault(); event.stopPropagation();
      if (!open) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      onOpenChange(!open);
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  }, [open, onOpenChange, returnFocus]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} aria-describedby={undefined}
      className="top-[15%] flex max-h-[70dvh] translate-y-0 flex-col gap-0 overflow-hidden bg-popover p-0 text-popover-foreground shadow-md sm:max-w-xl"
      onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); }}>
      <DialogTitle className="sr-only">{i18n.text(messages.title)}</DialogTitle>
      <Autocomplete disableVirtualFocus disableAutoFocusFirst
        filter={matchesCommandText}>
        <SearchField aria-label={i18n.text(messages.search)} className="flex shrink-0 items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          <Input ref={input} placeholder={i18n.text(messages.search)}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onFocus={() => setSearching(true)} onBlur={() => setSearching(false)}
            onKeyDown={event => {
              // The grid owns navigation once a row has focus; the search field only hands focus into it.
              if (event.nativeEvent.isComposing || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
              const rows = grid?.querySelectorAll<HTMLElement>(rowSelector);
              const row = event.key === "ArrowUp" ? rows?.[rows.length - 1] : rows?.[0];
              if (!row) return;
              event.preventDefault(); row.focus();
              if (event.key === "Enter") row.click();
            }} />
        </SearchField>
        <GridList ref={setGrid} aria-label={i18n.text(messages.title)} selectionMode="none" escapeKeyBehavior="none"
          keyboardNavigationBehavior="tab" disallowTypeAhead className="min-h-0 overflow-y-auto p-1.5 outline-none"
          renderEmptyState={() => <div className={commandEmpty}>{i18n.text(messages.empty)}</div>}>
          <CommandSection group={settingsCommands} context={context} namespace="host/settings" />
          {groups.map(group => <PluginSection key={JSON.stringify([group.pluginId, group.id])} group={group} context={context} />)}
        </GridList>
      </Autocomplete>
    </DialogContent>
  </Dialog>;
}
