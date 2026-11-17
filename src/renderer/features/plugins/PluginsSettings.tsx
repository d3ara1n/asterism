import { runtime } from "../../runtime";
import { pluginName } from "../../../shared/plugin-name";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { PluginSettingsPage } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { PluginRegion } from "./scope";
import type { AppSnapshot, Command } from "../../../shared/contracts";
import { errorDisplay } from "../../../shared/error-display";
import { pluginsMessages as messages } from "../../messages/plugins";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { StatusBadge, type StatusTone } from "@asterism-app/ui/ui/status";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@asterism-app/ui/ui/item";
import { Input } from "@asterism-app/ui/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "@asterism-app/ui/ui/select";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@asterism-app/ui/ui/alert-dialog";
import { usePluginSettingsRegistry } from "../../modules/settings";
import { NpmPluginInstaller } from "./NpmPluginInstaller";
import type { RendererOutcome } from "../../modules/plugin-outcome";

export type PluginInfo = AppSnapshot["plugins"][number];
type DisplayStatus = PluginInfo["status"] | "frontendFailed" | "partial";
const tones: Record<DisplayStatus, StatusTone> = { loaded: "success", disabled: "neutral", invalid: "error", failed: "error", pending: "warning", frontendFailed: "error", partial: "warning", available: "neutral" };
const labels = { loaded: messages.loaded, disabled: messages.disabled, invalid: messages.invalidPackage, failed: messages.failed, pending: messages.restartRequired,
  frontendFailed: messages.frontendFailed, partial: messages.partial, available: messages.available };
const stages = { discovery: messages.discoveryStage, build: messages.buildStage, storage: messages.storageStage, import: messages.importStage,
  setup: messages.setupStage, validation: messages.validationStage, dependency: messages.dependencyStage, style: messages.styleStage,
  prepare: messages.prepareStage, module: messages.moduleStage };
function pluginStatus(plugin: PluginInfo, renderers: ReadonlyMap<string, RendererOutcome>): DisplayStatus {
  const renderer = plugin.id ? renderers.get(plugin.id) : undefined;
  if (plugin.status !== "loaded") return plugin.status;
  return renderer?.status === "failed" ? "frontendFailed" : renderer?.status === "partial" ? "partial" : "loaded";
}

/** Package management operations retain the current list and report failures at their entry. */
export function usePlugins(active: boolean) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const run = useCallback(async (command: Command) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await runtime.execute(command);
      if (result.ok) setSnapshot(result.snapshot);
      else setError(errorDisplay(result.error));
    } catch { setError(messages.operationFailed); }
    finally { pending.current = false; setBusy(false); }
  }, []);
  const operation = snapshot?.npmOperation ?? null;
  const polling = operation && ["inspecting", "installing", "cancelling"].includes(operation.phase);
  useEffect(() => {
    if (!active || !polling) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await runtime.execute({ type: "workspace.read" });
        if (disposed) return;
        if (!result.ok) { setError(errorDisplay(result.error)); return; }
        setSnapshot(result.snapshot);
        if (result.snapshot.npmOperation && ["inspecting", "installing", "cancelling"].includes(result.snapshot.npmOperation.phase)) timer = setTimeout(() => { void poll(); }, 350);
      } catch { if (!disposed) setError(messages.operationFailed); }
    };
    timer = setTimeout(() => { void poll(); }, 350);
    return () => { disposed = true; clearTimeout(timer); };
  }, [active, polling, operation?.id]);
  useEffect(() => { if (active) void run({ type: "workspace.read" }); }, [active, run]);
  const add = async () => {
    try { const path = await window.host.pickDirectory(); if (path) await run({ type: "plugin.add", path }); }
    catch { setError(messages.operationFailed); }
  };
  return { operation, list: snapshot?.plugins ?? [], restartRequired: snapshot?.restartRequired ?? false, busy, error, run, add };
}
export type PluginManager = ReturnType<typeof usePlugins>;

export function PluginsSettings({ manager }: { manager: PluginManager }) {
  const i18n = useI18n();
  const { renderers } = usePluginSettingsRegistry();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [installer, setInstaller] = useState<{ targetSource?: string; name?: string } | null>(null);
  const npmPending = manager.operation && ["inspecting", "installing", "awaiting-approval", "cancelling"].includes(manager.operation.phase);
  const search = query.trim().toLocaleLowerCase();
  const list = manager.list.filter(plugin => {
    const status = pluginStatus(plugin, renderers);
    const text = [plugin.id, plugin.metadata.name ? i18n.text(plugin.metadata.name) : "", plugin.metadata.description ? i18n.text(plugin.metadata.description) : "", plugin.metadata.author].join(" ").toLocaleLowerCase();
    return (filter === "all" || status === filter) && text.includes(search);
  });
  return <div className="flex flex-col gap-4">
    <p className="type-caption">{i18n.text(messages.pluginsSummary)}</p>
    <div className="flex flex-wrap items-center gap-3">
      <Input className="w-52" value={query} onChange={event => setQuery(event.target.value)} placeholder={i18n.text(messages.search)} aria-label={i18n.text(messages.search)} />
      <Select value={filter} onValueChange={setFilter}><SelectTrigger size="sm" aria-label={i18n.text(messages.filter)}><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="all">{i18n.text(messages.all)}</SelectItem>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{i18n.text(label)}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      <Button size="sm" disabled={manager.busy} onClick={() => { void manager.add(); }}>{manager.busy ? <Spinner /> : <Plus />}{i18n.text(messages.addPackage)}</Button>
    </div>
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" size="sm" disabled={manager.busy || Boolean(npmPending)} onClick={() => setInstaller({})}>{i18n.text(messages.installNpm)}</Button>
      {manager.operation && <Button variant="ghost" size="sm" onClick={() => setInstaller({ ...(manager.operation?.targetSource ? { targetSource: manager.operation.targetSource } : {}) })}>
        {i18n.text(npmPending ? messages.installationProgress : messages.installationResult)}
      </Button>}
    </div>
    {installer && <NpmPluginInstaller key={installer.targetSource ?? "new"} manager={manager} target={installer} onClose={() => setInstaller(null)} />}
    {manager.restartRequired && <Alert role="status"><AlertDescription>{i18n.text(messages.restartHint)}</AlertDescription></Alert>}
    {manager.error && <Alert variant="destructive"><AlertDescription>{i18n.text(manager.error)}<Button variant="outline" size="sm" disabled={manager.busy} onClick={() => { void manager.run({ type: "workspace.read" }); }}><RefreshCw />{i18n.text(messages.retry)}</Button></AlertDescription></Alert>}
    <ItemGroup>
      {list.map(plugin => (
        <PluginListItem
          key={plugin.source}
          plugin={plugin}
          status={pluginStatus(plugin, renderers)}
          failure={plugin.diagnostic
            ? i18n.formatMessage(messages.diagnostic, { stage: i18n.text(stages[plugin.diagnostic.stage]), message: plugin.diagnostic.message })
            : plugin.error ?? (plugin.status === "loaded" && plugin.id ? renderers.get(plugin.id)?.diagnostics.map(diagnostic =>
              i18n.formatMessage(messages.diagnostic, {
                stage: diagnostic.module === undefined ? i18n.text(stages[diagnostic.stage])
                  : i18n.formatMessage(messages.moduleNumber, { number: diagnostic.module + 1 }),
                message: diagnostic.message,
              })).join("\n") : undefined)}
          manager={manager}
          onUpdate={() => {
            setInstaller({ targetSource: plugin.source, name: plugin.npm?.name });
            if (plugin.npm && !npmPending) void manager.run({ type: "plugin.npm.preview", spec: `${plugin.npm.name}@latest`, targetSource: plugin.source });
          }}
        />
      ))}
    </ItemGroup>
    {!list.length && !manager.busy && <p className="type-caption py-6 text-center">{i18n.text(messages.noResults)}</p>}
  </div>;
}

function PluginListItem({ plugin, status, failure, manager, onUpdate }: {
  plugin: PluginInfo;
  status: DisplayStatus;
  failure?: string;
  manager: PluginManager;
  onUpdate(): void;
}) {
  const i18n = useI18n();
  const name = i18n.text(pluginName(plugin));
  const { index, metadata } = plugin;
  const details = [metadata.author, plugin.npm ? null : metadata.version, plugin.id, plugin.npm?.name ?? plugin.source].filter(Boolean).join(" · ");

  return (
    <Item size="sm" className="flex-nowrap items-start border-b last:border-b-0">
      <ItemContent className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <ItemTitle className="min-w-0 max-w-full wrap-anywhere">{name}</ItemTitle>
            <StatusBadge tone={tones[status]}>{i18n.text(labels[status])}</StatusBadge>
            {plugin.bundled && <Badge variant="secondary">{i18n.text(messages.builtIn)}</Badge>}
          </div>
          <ItemActions className="shrink-0">
            {index === null ? (
              <Button variant="outline" size="sm" disabled={manager.busy}
                onClick={() => { void manager.run({ type: "plugin.add-bundled", source: plugin.source }); }}>
                <Plus data-icon="inline-start" />{i18n.text(messages.addBack)}
              </Button>
            ) : <>
              {plugin.npm && <Button variant="outline" size="sm" disabled={manager.busy || Boolean(manager.operation && ["inspecting", "installing", "awaiting-approval", "cancelling"].includes(manager.operation.phase))} onClick={onUpdate}>{i18n.text(messages.checkUpdates)}</Button>}
              <Switch
                checked={plugin.enabled}
                disabled={manager.busy}
                aria-label={i18n.formatMessage(messages.enablePlugin, { plugin_name: name })}
                onCheckedChange={enabled => { void manager.run({ type: "plugin.enable", index, enabled }); }}
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive" disabled={manager.busy}>
                    {i18n.text(messages.remove)}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{i18n.text(messages.removeTitle)}</AlertDialogTitle>
                    <AlertDialogDescription>{i18n.text(plugin.bundled ? messages.removeBundledHint : plugin.npm ? messages.removeNpmHint : messages.removeHint)}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{i18n.text(messages.cancel)}</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => { void manager.run({ type: "plugin.remove", index }); }}
                    >
                      {i18n.text(messages.remove)}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>}
          </ItemActions>
        </div>
        {metadata.description && (
          <ItemDescription className="text-wrap wrap-anywhere">{i18n.text(metadata.description)}</ItemDescription>
        )}
        <p className="type-caption select-text wrap-anywhere">{details}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{i18n.text(plugin.npm ? messages.npmSource : plugin.bundled ? messages.bundledSource : messages.localSource)}</Badge>
          {plugin.npm && <span className="type-caption">{i18n.formatMessage(messages.selectedVersion, { version: plugin.npm.version })}</span>}
          {plugin.runningVersion && plugin.runningVersion !== (plugin.npm?.version ?? metadata.version) && <span className="type-caption">{i18n.formatMessage(messages.runningVersion, { version: plugin.runningVersion })}</span>}
        </div>
        {index === null && <p className="type-caption">{i18n.text(messages.availableHint)}</p>}
        {status === "frontendFailed" && <p className="type-caption">{i18n.text(messages.frontendFailedHint)}</p>}
        {failure && (
          <Alert variant={status === "partial" ? "default" : "destructive"}>
            <AlertDescription className="select-text whitespace-pre-wrap wrap-anywhere">{failure}</AlertDescription>
          </Alert>
        )}
      </ItemContent>
    </Item>
  );
}

/** Page communication and opened islands follow the page lifetime; a failed page can be retried independently. */
export function PluginSettingsContent({ pluginId, page, location }: { pluginId: string; page: PluginSettingsPage; location?: string }) {
  const i18n = useI18n();
  const [generation, setGeneration] = useState(0);
  const Body = page.Body;
  return <PluginRegion key={generation} pluginId={pluginId} page fallback={<Alert variant="destructive"><AlertDescription>{i18n.text(messages.pageFailed)}
    <Button variant="outline" size="sm" onClick={() => setGeneration(value => value + 1)}>{i18n.text(messages.retry)}</Button>
  </AlertDescription></Alert>}><Body location={location} /></PluginRegion>;
}
