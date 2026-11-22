import { createContext, Fragment, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Check, FolderOpen, FolderPlus, Package, Plus, Puzzle, RefreshCw, RotateCw, Search, ShieldAlert, Trash2, Undo2, X } from "lucide-react";
import type { PluginSettingsPage } from "@asterism-app/sdk/renderer";
import type { UiMessage, UiText } from "@asterism-app/sdk/contracts";
import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@asterism-app/ui/ui/alert-dialog";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { Checkbox } from "@asterism-app/ui/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism-app/ui/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@asterism-app/ui/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@asterism-app/ui/ui/empty";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@asterism-app/ui/ui/field";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Input } from "@asterism-app/ui/ui/input";
import { ItemGroup, ItemSeparator } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { ScrollArea } from "@asterism-app/ui/ui/scroll-area";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { StatusBadge, StatusIcon, StatusText, type StatusTone } from "@asterism-app/ui/ui/status";
import { Switch } from "@asterism-app/ui/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { cn } from "@asterism-app/ui/utils";
import { commonMessages } from "@asterism-app/ui/messages/common";
import type { AppSnapshot, Command, NpmOperation, PluginEntry } from "../../../shared/contracts";
import { errorDisplay } from "../../../shared/error-display";
import { pluginName } from "../../../shared/plugin-name";
import { pluginsMessages as messages } from "../../messages/plugins";
import { usePluginSettingsRegistry } from "../../modules/settings";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { toast } from "../../shared/toast";
import { IslandPanel, panelIslandWidth } from "../../shared/weave/IslandPanel";
import { useIsland, useIslandCancel } from "../../shared/weave/Screen";
import { Row, Section } from "@asterism-app/ui/settings-layout";
import { filterCounts, installSteps, matchesFilter, matchesQuery, pluginView, type InstallStep, type PluginFilter, type PluginView, type StepState } from "./model";
import { changes, conditions, originLabels, pluginDiagnostics, PluginIcon, selectedVersion, useRestart } from "./parts";
import { PluginRegion } from "./scope";

const pendingPhases = new Set<NpmOperation["phase"]>(["inspecting", "installing", "awaiting-approval", "cancelling"]);
const activePhases = new Set<NpmOperation["phase"]>(["inspecting", "installing", "cancelling"]);
const phaseLabels: Record<NpmOperation["phase"], UiMessage> = {
  inspecting: messages.inspecting, preview: messages.previewReady, installing: messages.installing,
  "awaiting-approval": messages.buildApproval, cancelling: messages.cancelling, succeeded: messages.installSucceeded,
  failed: messages.installFailed, cancelled: messages.installCancelled,
};
const phaseTones: Record<NpmOperation["phase"], StatusTone> = {
  inspecting: "progress", preview: "neutral", installing: "progress", "awaiting-approval": "warning", cancelling: "progress",
  succeeded: "success", failed: "error", cancelled: "neutral",
};

/** Package management state shared by the overview and the islands it opens. Each entry presents the failures of the operations it starts. */
export function usePlugins(active: boolean) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [readError, setReadError] = useState<UiText | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  /** Resolves to the failure for the calling entry, or null after success; a call while another is running is ignored. */
  const run = useCallback(async (command: Command): Promise<UiText | null> => {
    if (pending.current) return null;
    pending.current = true; setBusy(true);
    try {
      const result = await runtime.execute(command);
      if (!result.ok) return errorDisplay(result.error);
      setSnapshot(result.snapshot);
      return null;
    } catch { return messages.operationFailed; }
    finally { pending.current = false; setBusy(false); }
  }, []);
  const read = useCallback(async () => { setReadError(await run({ type: "workspace.read" })); }, [run]);
  const operation = snapshot?.npmOperation ?? null;
  const polling = operation !== null && activePhases.has(operation.phase);
  useEffect(() => {
    if (!active || !polling) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await runtime.execute({ type: "workspace.read" });
        if (disposed) return;
        if (!result.ok) { setReadError(errorDisplay(result.error)); return; }
        setSnapshot(result.snapshot);
        const next = result.snapshot.npmOperation;
        if (next && activePhases.has(next.phase)) timer = setTimeout(() => { void poll(); }, 350);
      } catch { if (!disposed) setReadError(messages.operationFailed); }
    };
    timer = setTimeout(() => { void poll(); }, 350);
    return () => { disposed = true; clearTimeout(timer); };
  }, [active, polling, operation?.id]);
  useEffect(() => { if (active) void read(); }, [active, read]);
  const add = async (): Promise<UiText | null> => {
    try {
      const path = await window.host.pickDirectory();
      return path ? await run({ type: "plugin.add", path }) : null;
    } catch { return messages.operationFailed; }
  };
  return { operation, list: snapshot?.plugins ?? [], loaded: snapshot !== null, restartRequired: snapshot?.restartRequired ?? false, busy, readError, run, read, add };
}
export type PluginManager = ReturnType<typeof usePlugins>;

/** Settings islands render beside the root rather than inside it, so they read management state and settings navigation from context. */
interface PluginsContextValue { manager: PluginManager; openPage(key: string): void }
const PluginsContext = createContext<PluginsContextValue | null>(null);
export const PluginsProvider = PluginsContext.Provider;
function usePluginsContext(): PluginsContextValue {
  const value = useContext(PluginsContext);
  if (!value) throw new Error("Plugin management requires PluginsProvider.");
  return value;
}

/** Plugin identity survives npm updates that replace the source; packages without a readable ID fall back to their source. */
const entryIdentity = (entry: PluginEntry) => entry.id ?? entry.source;
const detailKey = (identity: string) => `plugins:detail:${identity}`;
interface InstallTarget { source?: string; name?: string }
const installerKey = (target: InstallTarget) => `plugins:install:${target.source ?? "new"}`;

function useIslands() {
  const island = useIsland();
  return {
    island,
    detail: (entry: PluginEntry, origin?: HTMLElement | null) => {
      const identity = entryIdentity(entry);
      return island.open({ key: detailKey(identity), label: messages.details, width: panelIslandWidth, origin,
        render: () => <PluginDetailPanel identity={identity} /> });
    },
    installer: (target: InstallTarget, origin?: HTMLElement | null) => island.open({ key: installerKey(target),
      label: target.source ? messages.updateNpm : messages.installNpm, width: panelIslandWidth, origin,
      render: () => <NpmInstallerPanel target={target} /> }),
  };
}

/* ---------- Overview ---------- */

export function PluginsSettings() {
  const i18n = useI18n();
  const { manager } = usePluginsContext();
  const { renderers } = usePluginSettingsRegistry();
  const islands = useIslands();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PluginFilter>("all");
  const [error, setError] = useState<UiText | null>(null);
  const act = async (command: Command) => setError(await manager.run(command));
  const views = manager.list.map(entry => pluginView(entry, renderers));
  const counts = filterCounts(views);
  const visible = views.filter(view => matchesFilter(view, filter) && matchesQuery(view, query, value => i18n.text(value)));
  const installed = visible.filter(view => view.installed), included = visible.filter(view => !view.installed);
  const changeCount = views.filter(view => view.change).length;
  const operation = manager.operation;
  const filters: { value: PluginFilter; label: UiMessage; count?: number }[] = [
    { value: "all", label: messages.filterAll }, { value: "enabled", label: messages.filterEnabled, count: counts.enabled },
    { value: "disabled", label: messages.filterDisabled, count: counts.disabled }, { value: "issues", label: messages.filterIssues, count: counts.issues },
  ];
  const row = (view: PluginView) => <PluginRow key={view.entry.source} view={view} selected={islands.island.has(detailKey(entryIdentity(view.entry)))}
    onOpen={origin => { void islands.detail(view.entry, origin); }} onAct={act} />;

  return <div className="flex flex-col gap-4">
    {manager.restartRequired && <RestartBanner count={changeCount} />}
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><SearchInput value={query} onChange={setQuery} label={i18n.text(messages.search)} /></div>
        <AddPluginMenu onError={setError} onNpm={origin => { void islands.installer({}, origin); }} />
      </div>
      <ToggleGroup type="single" variant="segmented" size="sm" aria-label={i18n.text(messages.filter)} value={filter}
        onValueChange={value => { if (value) setFilter(value as PluginFilter); }}>
        {filters.map(item => <ToggleGroupItem key={item.value} value={item.value} className="gap-1.5 px-2.5">
          {item.value === "issues" && item.count ? <StatusIcon tone="error" className="size-3.5" /> : null}
          {i18n.text(item.label)}
          {item.count !== undefined && <span className="tabular-nums text-muted-foreground">{item.count}</span>}
        </ToggleGroupItem>)}
      </ToggleGroup>
    </div>
    {manager.readError && <Alert variant="destructive"><AlertDescription>{i18n.text(manager.readError)}
      <Button variant="outline" size="sm" disabled={manager.busy} onClick={() => { void manager.read(); }}><RefreshCw />{i18n.text(messages.retry)}</Button>
    </AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription className="select-text wrap-anywhere">{i18n.text(error)}</AlertDescription></Alert>}
    {operation && operation.phase !== "cancelled" && <ItemGroup className="surface-group">
      <ListRow opens media={<StatusIcon tone={phaseTones[operation.phase]} className="size-4" />}
        title={<span className="block truncate font-mono text-xs" translate="no">{operation.preview ? `${operation.preview.name}@${operation.preview.version}` : operation.spec}</span>}
        description={i18n.text(phaseLabels[operation.phase])}
        selected={islands.island.has(installerKey({ source: operation.targetSource ?? undefined }))}
        onOpen={origin => { void islands.installer(operation.targetSource ? { source: operation.targetSource } : {}, origin); }} />
    </ItemGroup>}
    {!manager.loaded ? !manager.readError && <p className="type-caption flex items-center justify-center gap-2 py-8" role="status"><Spinner />{i18n.text(commonMessages.loading)}</p>
      : !views.length ? <Empty className="surface-group">
        <EmptyHeader><EmptyMedia variant="icon"><Puzzle /></EmptyMedia><EmptyDescription>{i18n.text(messages.empty)}</EmptyDescription></EmptyHeader>
        <EmptyContent><AddPluginMenu onError={setError} onNpm={origin => { void islands.installer({}, origin); }} /></EmptyContent>
      </Empty>
      : !visible.length ? <Empty className="py-10" role="status">
        <EmptyHeader><EmptyMedia variant="icon" className="text-muted-foreground"><Search /></EmptyMedia><EmptyDescription>{i18n.text(messages.noResults)}</EmptyDescription></EmptyHeader>
      </Empty>
      : <div>
        {installed.length > 0 && <Section title={i18n.text(messages.installed)} action={<span className="type-caption tabular-nums">{installed.length}</span>}>
          <ItemGroup className="surface-group">{installed.map((view, index) => <Fragment key={view.entry.source}>{index > 0 && <ItemSeparator />}{row(view)}</Fragment>)}</ItemGroup>
        </Section>}
        {included.length > 0 && <Section title={i18n.text(messages.includedGroup)} action={<span className="type-caption tabular-nums">{included.length}</span>}>
          <ItemGroup className="surface-group">{included.map((view, index) => <Fragment key={view.entry.source}>{index > 0 && <ItemSeparator />}{row(view)}</Fragment>)}</ItemGroup>
        </Section>}
      </div>}
  </div>;
}

function RestartBanner({ count }: { count: number }) {
  const i18n = useI18n();
  const { restart, restarting } = useRestart();
  return <div role="status" className="surface-group flex items-center gap-3 py-2.5 pr-2.5 pl-4">
    <RotateCw className="size-4 shrink-0 text-primary-text" aria-hidden="true" />
    <p className="type-body min-w-0 flex-1">{count ? i18n.formatMessage(messages.pendingChanges, { count }) : i18n.text(messages.restartHint)}</p>
    <Button size="sm" disabled={restarting} aria-busy={restarting} onClick={restart}>{restarting && <Spinner data-icon="inline-start" />}{i18n.text(messages.restartNow)}</Button>
  </div>;
}

function AddPluginMenu({ onNpm, onError }: { onNpm(origin: HTMLElement | null): void; onError(error: UiText | null): void }) {
  const i18n = useI18n();
  const { manager } = usePluginsContext();
  const trigger = useRef<HTMLButtonElement>(null);
  const npmPending = manager.operation !== null && pendingPhases.has(manager.operation.phase);
  const option = (title: UiMessage, hint: UiMessage) => <span className="flex min-w-0 flex-col">
    <span>{i18n.text(title)}</span><span className="type-caption">{i18n.text(hint)}</span>
  </span>;
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <Button ref={trigger} size="sm" disabled={manager.busy}><Plus />{i18n.text(messages.add)}<ChevronDown className="opacity-60" /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-64">
      <DropdownMenuItem disabled={npmPending} onSelect={() => onNpm(trigger.current)}><Package />{option(messages.addNpm, messages.addNpmHint)}</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => { void manager.add().then(onError); }}><FolderPlus />{option(messages.addDirectory, messages.addDirectoryHint)}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function ChangeBadge({ change }: { change: NonNullable<PluginView["change"]> }) {
  const i18n = useI18n();
  return <Badge variant="secondary" className="font-normal"><RotateCw />{i18n.text(changes[change])}</Badge>;
}

/** Issues outrank pending changes in the row; the detail island shows both. */
function PluginRow({ view, selected, onOpen, onAct }: { view: PluginView; selected: boolean; onOpen(origin: HTMLElement): void; onAct(command: Command): Promise<void> }) {
  const i18n = useI18n();
  const { manager } = usePluginsContext();
  const { entry } = view;
  const name = i18n.text(pluginName(entry));
  const condition = conditions[view.condition];
  const version = selectedVersion(entry);
  const restore = () => { void onAct({ type: "plugin.restore", source: entry.source }); };
  return <ListRow opens selected={selected} inactive={view.installed && !entry.selection?.enabled} onOpen={onOpen}
    media={<PluginIcon entry={entry} />}
    title={<span className="block truncate">{name}</span>}
    description={entry.metadata.description ? i18n.text(entry.metadata.description) : <span className="font-mono text-xs" translate="no">{entry.id ?? entry.source}</span>}
    details={[version, i18n.text(originLabels[entry.origin.kind])].filter(Boolean).join(" · ")}
    trailing={view.issue ? <StatusBadge tone={condition.tone}>{i18n.text(condition.label)}</StatusBadge> : view.change && <ChangeBadge change={view.change} />}
    actions={entry.selection
      ? <Switch checked={entry.selection.enabled} disabled={manager.busy} aria-label={i18n.formatMessage(messages.enablePlugin, { plugin_name: name })}
        onCheckedChange={enabled => { void onAct({ type: "plugin.enable", source: entry.source, enabled }); }} />
      : view.installed
        ? <Button variant="ghost" size="sm" disabled={manager.busy} aria-label={i18n.formatMessage(messages.undoRemoveLabel, { plugin_name: name })} onClick={restore}>
          <Undo2 data-icon="inline-start" />{i18n.text(messages.undoRemove)}
        </Button>
        : <Button variant="outline" size="sm" disabled={manager.busy} onClick={restore}><Plus data-icon="inline-start" />{i18n.text(messages.addBundled)}</Button>} />;
}

/* ---------- Detail island ---------- */

function PluginDetailPanel({ identity }: { identity: string }) {
  const i18n = useI18n();
  const { manager, openPage } = usePluginsContext();
  const { renderers, pages } = usePluginSettingsRegistry();
  const islands = useIslands();
  const { restart, restarting } = useRestart();
  const [error, setError] = useState<UiText | null>(null);
  const [removing, setRemoving] = useState(false);
  useIslandCancel(async () => { await islands.island.close(); });
  const entry = manager.list.find(item => entryIdentity(item) === identity);
  if (!entry) return <IslandPanel title={i18n.text(messages.details)}>
    <p className="type-caption" role="status">{i18n.text(messages.gone)}</p>
  </IslandPanel>;

  const view = pluginView(entry, renderers);
  const name = i18n.text(pluginName(entry));
  const condition = conditions[view.condition];
  const diagnostics = pluginDiagnostics(view, renderers, i18n);
  const ownPages = entry.id ? [...pages].filter(([, page]) => page.pluginId === entry.id) : [];
  const version = selectedVersion(entry);
  const running = entry.startup?.status === "loaded" && entry.startup.version !== version ? entry.startup.version : null;
  const npmPending = manager.operation !== null && pendingPhases.has(manager.operation.phase);
  const act = async (command: Command) => setError(await manager.run(command));
  const checkUpdates = (origin: HTMLElement) => {
    if (entry.origin.kind !== "npm") return;
    void islands.installer({ source: entry.source, name: entry.origin.name }, origin);
    void act({ type: "plugin.npm.preview", spec: `${entry.origin.name}@latest`, targetSource: entry.source });
  };
  const reveal = (path: string) => window.host.showLocalFile(path, true)
    .then(failure => { if (failure) toast.error(failure); }, () => { toast.error(i18n.text(messages.operationFailed)); });
  const openOwnPage = async (key: string) => { if (await islands.island.close()) openPage(key); };
  const removeHint = entry.origin.kind === "bundled" ? messages.removeBundledHint : entry.origin.kind === "npm" ? messages.removeNpmHint : messages.removeHint;

  // Title bar: the primary action for an unselected entry, and removal for a selected one. Secondary actions sit with their content sections.
  const action = entry.selection
    ? <IconButton className="text-destructive" label={i18n.text(messages.remove)} disabled={manager.busy} onClick={() => setRemoving(true)}><Trash2 /></IconButton>
    : <Button size="sm" variant={entry.pending ? "outline" : "default"} disabled={manager.busy} onClick={() => { void act({ type: "plugin.restore", source: entry.source }); }}>
      {entry.pending ? <Undo2 data-icon="inline-start" /> : <Plus data-icon="inline-start" />}{i18n.text(entry.pending ? messages.undoRemove : messages.addBundled)}
    </Button>;

  return <IslandPanel title={name} description={version ?? undefined} action={action}>
    <div className="flex flex-col gap-6">
      <section className="flex items-start gap-4">
        <PluginIcon entry={entry} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.selection || entry.startup
              ? <StatusBadge tone={condition.tone}>{i18n.text(condition.label)}</StatusBadge>
              : <Badge variant="outline" className="font-normal">{i18n.text(messages.notAdded)}</Badge>}
            {view.change && <ChangeBadge change={view.change} />}
          </div>
          {entry.metadata.description && <p className="type-body text-pretty select-text">{i18n.text(entry.metadata.description)}</p>}
          {!entry.selection && <p className="type-caption">{i18n.text(entry.pending ? messages.removedHint : messages.availableHint)}</p>}
          {view.condition === "interfaceFailed" && <p className="type-caption">{i18n.text(messages.frontendFailedHint)}</p>}
        </div>
      </section>

      {view.change && <div className="flex items-center gap-3 rounded-lg bg-muted/60 py-2 pr-2 pl-3">
        <p className="type-caption min-w-0 flex-1">{i18n.text(messages.restartHint)}</p>
        <Button variant="outline" size="sm" disabled={restarting} aria-busy={restarting} onClick={restart}>
          {restarting && <Spinner data-icon="inline-start" />}{i18n.text(messages.restartNow)}
        </Button>
      </div>}

      {diagnostics.length > 0 && <Alert variant={view.condition === "interfacePartial" ? "default" : "destructive"}>
        <StatusIcon tone={view.condition === "interfacePartial" ? "warning" : "error"} />
        <AlertDescription className="select-text whitespace-pre-wrap wrap-anywhere">{diagnostics.join("\n")}</AlertDescription>
      </Alert>}

      {entry.selection && <ItemGroup className="surface-group">
        <Row label={i18n.text(messages.enabled)} hint={i18n.text(messages.enabledHint)}>
          <Switch checked={entry.selection.enabled} disabled={manager.busy} aria-label={i18n.formatMessage(messages.enablePlugin, { plugin_name: name })}
            onCheckedChange={enabled => { void act({ type: "plugin.enable", source: entry.source, enabled }); }} />
        </Row>
      </ItemGroup>}

      {ownPages.length > 0 && <Section title={i18n.text(messages.settingsPages)}>
        <ItemGroup className="surface-group">{ownPages.map(([key, page], index) => <Fragment key={key}>
          {index > 0 && <ItemSeparator />}
          <PageRow page={page} onOpen={() => { void openOwnPage(key); }} />
        </Fragment>)}</ItemGroup>
      </Section>}

      <Section title={i18n.text(messages.package)} action={entry.selection && entry.origin.kind === "npm" && <Button variant="outline" size="sm"
        disabled={manager.busy || npmPending} onClick={event => checkUpdates(event.currentTarget)}><RefreshCw data-icon="inline-start" />{i18n.text(messages.checkUpdates)}</Button>}>
        <dl className="surface-group grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-6 gap-y-2.5 px-4 py-3.5">
          <dt className="type-label">{i18n.text(messages.source)}</dt>
          <dd className="flex min-w-0 items-center gap-1.5 text-sm">
            {entry.origin.kind === "bundled" ? i18n.text(messages.includedWithApp)
              : entry.origin.kind === "npm" ? <><span className="min-w-0 font-mono text-xs select-text wrap-anywhere" translate="no">{entry.origin.name}</span><Badge variant="outline" className="font-normal">npm</Badge></>
              : <><span className="min-w-0 font-mono text-xs select-text wrap-anywhere" translate="no">{entry.origin.path}</span>
                <IconButton size="icon-xs" label={i18n.text(commonMessages.showInFileManager)} onClick={() => { if (entry.origin.kind === "path") void reveal(entry.origin.path); }}><FolderOpen /></IconButton></>}
          </dd>
          {version && <><dt className="type-label">{i18n.text(messages.version)}</dt><dd className="text-sm tabular-nums select-text">{version}</dd></>}
          {running && <><dt className="type-label">{i18n.text(messages.runningVersion)}</dt><dd className="text-sm tabular-nums select-text">{running}</dd></>}
          {entry.metadata.author && <><dt className="type-label">{i18n.text(messages.author)}</dt><dd className="text-sm select-text wrap-anywhere">{entry.metadata.author}</dd></>}
          {entry.id && <><dt className="type-label">{i18n.text(messages.pluginId)}</dt><dd className="font-mono text-xs select-text wrap-anywhere" translate="no">{entry.id}</dd></>}
        </dl>
      </Section>

      {error && <Alert variant="destructive"><AlertDescription className="select-text wrap-anywhere">{i18n.text(error)}</AlertDescription></Alert>}
    </div>
    <AlertDialog open={removing} onOpenChange={setRemoving}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{i18n.text(messages.removeTitle)}</AlertDialogTitle>
          <AlertDialogDescription>{i18n.text(removeHint)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{i18n.text(messages.cancel)}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { void act({ type: "plugin.remove", source: entry.source }); }}>{i18n.text(messages.remove)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </IslandPanel>;
}

function PageRow({ page, onOpen }: { page: PluginSettingsPage; onOpen(): void }) {
  const i18n = useI18n();
  const Icon = page.icon ?? Puzzle;
  return <ListRow opens onOpen={onOpen} media={<Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
    title={i18n.text(page.title)} description={i18n.text(page.summary)} />;
}

/* ---------- npm installer island ---------- */

const steps: [InstallStep, UiMessage][] = [["version", messages.stepVersion], ["review", messages.stepReview], ["install", messages.stepInstall]];

function Steps({ states }: { states: Record<InstallStep, StepState> }) {
  const i18n = useI18n();
  return <ol className="flex items-center gap-2">
    {steps.map(([step, label], index) => {
      const state = states[step];
      const now = state === "current" || state === "busy";
      return <li key={step} aria-current={now ? "step" : undefined} className={cn("flex min-w-0 items-center gap-2", index < steps.length - 1 && "flex-1")}>
        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums transition-colors [&_svg]:size-3",
          state === "done" && "border-primary bg-primary text-primary-foreground",
          state === "failed" && "border-destructive bg-destructive text-destructive-foreground",
          now && "border-primary-text text-primary-text",
          state === "upcoming" && "text-muted-foreground")}>
          {state === "done" ? <Check /> : state === "failed" ? <X /> : state === "busy" ? <Spinner /> : index + 1}
        </span>
        <span className={cn("type-label truncate", now && "text-foreground")}>{i18n.text(label)}</span>
        {index < steps.length - 1 && <span aria-hidden="true" className={cn("h-px min-w-3 flex-1", state === "done" ? "bg-primary/60" : "bg-border")} />}
      </li>;
    })}
  </ol>;
}

/** One shared host operation drives every installer; an installer shows it only for its own target, and starts over after cancellation. */
function NpmInstallerPanel({ target }: { target: InstallTarget }) {
  const i18n = useI18n(), island = useIsland(), id = useId();
  const { manager } = usePluginsContext();
  const { restart, restarting } = useRestart();
  useIslandCancel(async () => { await island.close(); });
  const operation = manager.operation;
  const matching = operation !== null && operation.targetSource === (target.source ?? null);
  const current = matching && operation.phase !== "cancelled" ? operation : null;
  const [spec, setSpec] = useState(() => matching ? operation.spec : target.name ? `${target.name}@latest` : "");
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<UiText | null>(null);
  const pending = operation !== null && pendingPhases.has(operation.phase);
  const states = installSteps(current);
  const preview = current?.preview ?? null;
  const changed = spec.trim() !== current?.spec;
  const run = async (command: Command) => setError(await manager.run(command));
  const inspect = () => {
    setApproved(new Set());
    void run({ type: "plugin.npm.preview", spec, ...(target.source ? { targetSource: target.source } : {}) });
  };

  // Cancellation acts on the whole operation, so it sits in the title bar.
  const cancel = current && pendingPhases.has(current.phase) && <Button variant="outline" size="sm" disabled={manager.busy || current.phase === "cancelling"}
    onClick={() => { void run({ type: "plugin.npm.cancel", operationId: current.id }); }}>{i18n.text(messages.cancelInstallation)}</Button>;
  return <IslandPanel title={i18n.text(target.source ? messages.updateNpm : messages.installNpm)} action={cancel || undefined}>
    <div className="flex flex-col gap-6">
      <Steps states={states} />
      <p className="type-caption flex gap-2"><ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />{i18n.text(messages.npmTrust)}</p>

      <Field>
        <FieldLabel htmlFor={id}>{i18n.text(messages.packageSpec)}</FieldLabel>
        <div className="flex gap-2">
          <Input id={id} value={spec} disabled={pending || manager.busy} placeholder="@publisher/plugin@latest" spellCheck={false} autoComplete="off"
            autoFocus={!spec} className="font-mono text-xs" translate="no"
            onChange={event => setSpec(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !pending && spec.trim()) inspect(); }} />
          <Button variant={preview && !changed ? "outline" : "default"} disabled={!spec.trim() || pending || manager.busy} onClick={inspect}>
            {states.version === "busy" && <Spinner data-icon="inline-start" />}{i18n.text(messages.inspectPackage)}
          </Button>
        </div>
        <FieldDescription>{i18n.text(messages.packageSpecHint)}</FieldDescription>
        {pending && !matching && <StatusText tone="progress">{i18n.text(messages.otherOperation)}</StatusText>}
        {matching && operation.phase === "cancelled" && <StatusText tone="neutral">{i18n.text(messages.installCancelled)}</StatusText>}
      </Field>

      {current && preview && <div className="surface-group flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Package className="size-4" aria-hidden="true" /></span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="font-mono text-sm font-medium select-text wrap-anywhere" translate="no">{preview.name}<span className="text-muted-foreground">@{preview.version}</span></p>
            {preview.description && <p className="type-caption text-pretty">{preview.description}</p>}
          </div>
        </div>
        {preview.integrity && <p className="type-caption flex min-w-0 gap-2"><span className="shrink-0">{i18n.text(messages.integrity)}</span>
          <TooltipHint content={preview.integrity}><span className="truncate font-mono select-text" translate="no">{preview.integrity}</span></TooltipHint></p>}
        {current.phase === "preview" && <Button size="sm" className="self-start" disabled={manager.busy || changed}
          onClick={() => { void run({ type: "plugin.npm.install", operationId: current.id }); }}>
          {i18n.text(target.source ? messages.confirmUpdate : messages.confirmInstall)}
        </Button>}
      </div>}

      {current && (current.phase === "installing" || current.phase === "cancelling") && <StatusText tone="progress">{i18n.text(phaseLabels[current.phase])}</StatusText>}

      {current?.phase === "awaiting-approval" && <FieldSet className="surface-group gap-3 p-4">
        <FieldLegend variant="label" className="flex items-center gap-2"><StatusIcon tone="warning" className="size-4" />{i18n.text(messages.buildApproval)}</FieldLegend>
        <FieldDescription>{i18n.text(messages.buildTrust)}</FieldDescription>
        {current.blockedBuilds.map(name => <Field key={name} orientation="horizontal">
          <Checkbox id={`${id}-${name}`} checked={approved.has(name)} disabled={manager.busy} onCheckedChange={checked => setApproved(previous => {
            const next = new Set(previous); if (checked === true) next.add(name); else next.delete(name); return next;
          })} />
          <FieldLabel htmlFor={`${id}-${name}`} className="font-mono text-xs" translate="no">{name}</FieldLabel>
        </Field>)}
        <Button size="sm" className="self-start" disabled={manager.busy || !current.blockedBuilds.some(name => approved.has(name))} onClick={() => {
          void run({ type: "plugin.npm.approve", operationId: current.id, packages: current.blockedBuilds.filter(name => approved.has(name)) });
        }}>{i18n.text(messages.approveBuilds)}</Button>
      </FieldSet>}

      {current?.phase === "succeeded" && <div role="status" className="surface-group flex items-center gap-3 py-2.5 pr-2.5 pl-4">
        <StatusIcon tone="success" className="size-4 shrink-0" />
        <p className="type-body min-w-0 flex-1">{i18n.text(messages.installSucceeded)}</p>
        <Button size="sm" disabled={restarting} aria-busy={restarting} onClick={restart}>{restarting && <Spinner data-icon="inline-start" />}{i18n.text(messages.restartNow)}</Button>
      </div>}

      {current?.error && <Alert variant="destructive"><AlertDescription className="select-text whitespace-pre-wrap wrap-anywhere">{current.error}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription className="select-text wrap-anywhere">{i18n.text(error)}</AlertDescription></Alert>}

      {current?.output && <Collapsible key={current.id} defaultOpen={current.phase === "failed"}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="xs" className="group -ml-1.5 text-muted-foreground">
            <ChevronRight className="transition-transform group-data-[state=open]:rotate-90" />{i18n.text(messages.output)}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ScrollArea className="mt-2 h-48 rounded-md bg-muted/50"><pre className="type-caption select-text whitespace-pre-wrap wrap-anywhere p-3 font-mono">{current.output}</pre></ScrollArea>
        </CollapsibleContent>
      </Collapsible>}
    </div>
  </IslandPanel>;
}

/* ---------- Plugin-owned settings pages ---------- */

/** Page communication and opened islands follow the page lifetime; a failed page can be retried independently. */
export function PluginSettingsContent({ pluginId, page, location }: { pluginId: string; page: PluginSettingsPage; location?: string }) {
  const i18n = useI18n();
  const [generation, setGeneration] = useState(0);
  const Body = page.Body;
  return <PluginRegion key={generation} pluginId={pluginId} page fallback={<Alert variant="destructive"><AlertDescription>{i18n.text(messages.pageFailed)}
    <Button variant="outline" size="sm" onClick={() => setGeneration(value => value + 1)}>{i18n.text(messages.retry)}</Button>
  </AlertDescription></Alert>}><Body location={location} /></PluginRegion>;
}
