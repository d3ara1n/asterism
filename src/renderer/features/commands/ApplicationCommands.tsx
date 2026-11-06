import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { UiText } from "@asterism-app/sdk/contracts";
import {
  RendererPreferencesProvider,
  type RendererCommand, type RendererCommandContext, type RendererCommandGroup, type RendererSessionSnapshot,
} from "@asterism-app/sdk/renderer";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@asterism-app/ui/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { cn } from "@asterism-app/ui/utils";
import { filterCommandLabels } from "@asterism-app/ui/command-filter";
import { CommandBack, isCommandBackKey, useCommandPageMotion } from "@asterism-app/ui/command-page";
import { commandDetail, commandEmpty, commandHeading, commandListMotion, commandRow } from "@asterism-app/ui/command-styles";
import { commandsMessages as messages } from "../../messages/commands";
import { usePluginCommands, type RegisteredCommandGroup } from "../../modules/commands";
import { useI18n } from "../../shared/i18n";
import { PluginCallScope, SettingsBoundary } from "../plugins/scope";
import { pluginPreferences } from "../creation/preferences";
import { resolveCommandPage } from "./model";
import { settingsCommands } from "./settings";

interface Page {
  namespace: string;
  path: readonly { id: string; label: UiText }[];
}
interface Navigation {
  page: Page | null;
  openPage(namespace: string, command: RendererCommand): void;
}

/** Rows contain one action target; saved choices and read-only feedback are separate from navigation highlight. */
function CommandRow({ id, command, heading, disabled, onOpen }: {
  id: string; command: RendererCommand; heading: string; disabled: boolean; onOpen(): void;
}) {
  const i18n = useI18n();
  const detailId = useId();
  return <CommandItem value={id} keywords={[i18n.text(command.label), heading, ...command.keywords ?? []]}
    disabled={disabled || command.disabled} aria-describedby={command.detail ? detailId : undefined}
    onSelect={() => { if (command.children) onOpen(); else command.onAction(); }}
    className={commandRow}>
    {command.icon && <span className="shrink-0 text-muted-foreground" aria-hidden="true">{command.icon}</span>}
    <div className="min-w-0 flex-1">
      <div className="truncate">{i18n.text(command.label)}</div>
      {command.detail && <div id={detailId} className={cn("mt-0.5", commandDetail)}>{command.detail}</div>}
    </div>
    {command.current && <><Check className="ml-auto" aria-hidden="true" /><span className="sr-only">{i18n.text(messages.current)}</span></>}
    {command.children && <ChevronRight className="ml-auto" aria-hidden="true" />}
  </CommandItem>;
}

/** Keep contribution hooks mounted across navigation and filtering so pending work and feedback retain their owner. */
function CommandSection({ group, context, namespace, heading, navigation }: {
  group: RendererCommandGroup; context: RendererCommandContext; namespace: string; heading?: string; navigation: Navigation;
}) {
  const i18n = useI18n();
  const commands = group.useCommands(context);
  const { page } = navigation;
  if (page && page.namespace !== namespace) return null;
  const path = page?.path.map(entry => entry.id) ?? [];
  const level = resolveCommandPage(commands, path);
  const visible = level?.commands.filter(command => command.when !== false) ?? [];
  if (!level || !visible.length) return null;
  const attribution = heading ?? i18n.text(group.label);
  // A nested page is named by its return control; its rows carry their own state, so the parent's heading and detail are not repeated.
  return <CommandGroup className="p-0 [&_[cmdk-group-heading]]:p-0" heading={!page && <div className={commandHeading}>{attribution}</div>}>
    {visible.map(command => <CommandRow key={command.id} id={JSON.stringify([namespace, ...path, command.id])}
      command={command} heading={attribution} disabled={level.disabled}
      onOpen={() => navigation.openPage(namespace, command)} />)}
  </CommandGroup>;
}

function PluginSection({ group, context, navigation }: {
  group: RegisteredCommandGroup; context: RendererCommandContext; navigation: Navigation;
}) {
  const i18n = useI18n();
  const namespace = JSON.stringify([group.pluginId, group.id]);
  const heading = `${i18n.text(group.pluginName)} · ${i18n.text(group.label)}`;
  const preferences = useMemo(() => pluginPreferences(group.pluginId), [group.pluginId]);
  const visible = !navigation.page || navigation.page.namespace === namespace;
  return <SettingsBoundary fallback={visible && <CommandGroup heading={<div className={commandHeading}>{heading}</div>}>
    <CommandItem value={JSON.stringify([namespace, "failed"])} keywords={[heading]} disabled className={cn(commandRow, "text-destructive")}>
      {i18n.text(messages.pluginFailed)}
    </CommandItem>
  </CommandGroup>}>
    <RendererPreferencesProvider value={preferences}><PluginCallScope>
      <CommandSection group={group} context={context} namespace={namespace} heading={heading} navigation={navigation} />
    </PluginCallScope></RendererPreferencesProvider>
  </SettingsBoundary>;
}

/** One opening owns the page stack and search; dismissal disposes plugin calls, but not application services. */
function CommandContent({ session, ready, close }: {
  session: RendererSessionSnapshot | null; ready: boolean; close(): void;
}) {
  const i18n = useI18n();
  const groups = usePluginCommands();
  const input = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [search, setSearch] = useState("");
  const [value, setValue] = useState("");
  const context = useMemo<RendererCommandContext>(() => ({ session, ready, close }), [session, ready, close]);
  const body = useCommandPageMotion<HTMLDivElement>(page ? JSON.stringify([page.namespace, ...page.path.map(entry => entry.id)]) : "", page?.path.length ?? 0);
  const navigate = (next: Page | null) => {
    setPage(next); setSearch(""); setValue("");
    input.current?.focus({ preventScroll: true });
  };
  const back = () => { if (page) navigate(page.path.length > 1 ? { ...page, path: page.path.slice(0, -1) } : null); };
  const navigation: Navigation = {
    page,
    openPage: (namespace, command) => navigate({ namespace, path: [...page?.path ?? [], { id: command.id, label: command.label }] }),
  };
  return <>
    {page && <CommandBack label={i18n.text(page.path.at(-1)!.label)} onBack={back} />}
    <Command label={i18n.text(messages.title)} filter={filterCommandLabels} value={value} onValueChange={setValue}
      className="h-auto min-h-0 bg-transparent **:data-[slot=command-input-wrapper]:h-12 **:data-[slot=command-input-wrapper]:px-4">
      <CommandInput ref={input} autoFocus value={search} onValueChange={setSearch} placeholder={i18n.text(messages.search)}
        onKeyDown={event => {
          if (page && isCommandBackKey(event, search)) {
            event.preventDefault(); back();
          }
        }} />
      <CommandList className={`max-h-[calc(70dvh-7rem)] min-h-0 scroll-py-2 ${commandListMotion}`}>
        <div ref={body} className="p-1.5">
          <CommandEmpty className={commandEmpty}>{i18n.text(messages.empty)}</CommandEmpty>
          <CommandSection group={settingsCommands} context={context} namespace="host/settings" navigation={navigation} />
          {groups.map(group => <PluginSection key={JSON.stringify([group.pluginId, group.id])} group={group} context={context} navigation={navigation} />)}
        </div>
      </CommandList>
    </Command>
  </>;
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
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
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
      onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); }}>
      <DialogTitle className="sr-only">{i18n.text(messages.title)}</DialogTitle>
      {/* Content mounts and unmounts with the dialog's presence, so the exit animation keeps its rows. */}
      <CommandContent session={session} ready={ready} close={close} />
    </DialogContent>
  </Dialog>;
}
