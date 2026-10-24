import { runtime } from "../../runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Plus, Puzzle, RefreshCw } from "lucide-react";
import { RendererPreferencesProvider, type PluginSettingsPage } from "@atelier/sdk/renderer";
import type { UiText } from "@atelier/sdk/contracts";
import { PluginCallScope, PluginIslandProvider, SettingsBoundary } from "./scope";
import { pluginPreferences } from "../creation/preferences";
import type { AppSnapshot, Command } from "../../../shared/contracts";
import { errorDisplay } from "../../../shared/error-display";
import { pluginsMessages as messages } from "../../messages/plugins";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "@atelier/ui/ui/alert";
import { StatusBadge, type StatusTone } from "@atelier/ui/ui/status";
import { Badge } from "@atelier/ui/ui/badge";
import { Button } from "@atelier/ui/ui/button";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@atelier/ui/ui/item";
import { Input } from "@atelier/ui/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@atelier/ui/ui/select";
import { Switch } from "@atelier/ui/ui/switch";
import { Spinner } from "@atelier/ui/ui/spinner";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@atelier/ui/ui/alert-dialog";
import { islandTransition } from "../../shared/weave/motion";
import { usePluginSettingsRegistry } from "../../modules/settings";

export type PluginInfo = AppSnapshot["plugins"][number];
export const pluginKey = (plugin: PluginInfo) => `plugin:${plugin.source}`;
const tones: Record<PluginInfo["status"], StatusTone> = { loaded: "success", disabled: "neutral", invalid: "error", failed: "error", pending: "warning" };
const labels = { loaded: messages.loaded, disabled: messages.disabled, invalid: messages.invalidPackage, failed: messages.failed, pending: messages.restartRequired };
function pluginStatus(plugin: PluginInfo, failures: ReadonlyMap<string, string>): PluginInfo["status"] {
  return plugin.status === "loaded" && plugin.id && failures.has(plugin.id) ? "failed" : plugin.status;
}

/** 包管理状态在总览和详情之间共用，操作期间不重建页面。 */
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
  useEffect(() => { if (active) void run({ type: "workspace.read" }); }, [active, run]);
  const add = async () => {
    try { const path = await window.host.pickDirectory(); if (path) await run({ type: "plugin.add", path }); }
    catch { setError(messages.operationFailed); }
  };
  return { list: snapshot?.plugins ?? [], restartRequired: snapshot?.restartRequired ?? false, busy, error, run, add };
}
export type PluginManager = ReturnType<typeof usePlugins>;

function PluginFeedback({ manager }: { manager: PluginManager }) {
  const i18n = useI18n();
  return <>
    {manager.restartRequired && <Alert role="status"><AlertDescription>{i18n.text(messages.restartHint)}</AlertDescription></Alert>}
    {manager.error && <Alert variant="destructive"><AlertDescription>{i18n.text(manager.error)}<Button variant="outline" size="sm" disabled={manager.busy} onClick={() => { void manager.run({ type: "workspace.read" }); }}><RefreshCw />{i18n.text(messages.retry)}</Button></AlertDescription></Alert>}
  </>;
}
function PluginStatus({ plugin }: { plugin: PluginInfo }) {
  const i18n = useI18n();
  const { failures } = usePluginSettingsRegistry();
  const status = pluginStatus(plugin, failures);
  return <StatusBadge tone={tones[status]}>{i18n.text(labels[status])}</StatusBadge>;
}
export function PluginsOverview({ manager, onOpen, cardRef, query, filter, onQuery, onFilter }: {
  manager: PluginManager; onOpen(key: string): void; cardRef(key: string, node: HTMLButtonElement | null): void;
  query: string; filter: string; onQuery(value: string): void; onFilter(value: string): void;
}) {
  const i18n = useI18n();
  const { failures } = usePluginSettingsRegistry();
  const search = query.trim().toLocaleLowerCase();
  const list = manager.list.filter(plugin => {
    const status = pluginStatus(plugin, failures);
    const text = [plugin.id, plugin.metadata.name ? i18n.text(plugin.metadata.name) : "", plugin.metadata.description ? i18n.text(plugin.metadata.description) : "", plugin.metadata.author].join(" ").toLocaleLowerCase();
    return (filter === "all" || status === filter) && text.includes(search);
  });
  return <section className="flex flex-col gap-4" aria-labelledby="plugin-list-title">
    <header className="flex flex-wrap items-center gap-3">
      <h2 id="plugin-list-title" className="type-section mr-auto">{i18n.text(messages.plugins)}</h2>
      <Input className="w-52" value={query} onChange={event => onQuery(event.target.value)} placeholder={i18n.text(messages.search)} aria-label={i18n.text(messages.search)} />
      <Select value={filter} onValueChange={onFilter}><SelectTrigger size="sm" aria-label={i18n.text(messages.filter)}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">{i18n.text(messages.all)}</SelectItem>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{i18n.text(label)}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" disabled={manager.busy} onClick={() => { void manager.add(); }}>{manager.busy ? <Spinner /> : <Plus />}{i18n.text(messages.addPackage)}</Button>
      <p className="type-caption w-full">{i18n.text(messages.pluginsSummary)}</p>
    </header>
    <PluginFeedback manager={manager} />
    <div className="settings-grid">
      {list.map(plugin => <Item key={pluginKey(plugin)} variant="outline" asChild className="surface grid h-full grid-cols-[auto_minmax(0,1fr)] items-start text-left hover:bg-accent">
        <motion.button type="button" ref={node => cardRef(pluginKey(plugin), node)} onClick={() => onOpen(pluginKey(plugin))}
          layoutId={`settings-card-${pluginKey(plugin)}`} transition={islandTransition}>
          {plugin.metadata.icon ? <img src={plugin.metadata.icon} alt="" className="size-10 shrink-0 object-contain" /> : <Puzzle className="size-8 shrink-0 text-muted-foreground" />}
          <ItemContent className="min-w-0 w-full">
            <ItemTitle className="min-w-0 w-full break-words">{plugin.metadata.name ? i18n.text(plugin.metadata.name) : plugin.id ?? i18n.text(messages.unknownPlugin)}</ItemTitle>
            {plugin.metadata.description && <ItemDescription className="text-wrap">{i18n.text(plugin.metadata.description)}</ItemDescription>}
            <span className="type-caption">{[plugin.metadata.author, plugin.metadata.version].filter(Boolean).join(" · ")}</span>
            <span className="mt-1 flex flex-wrap gap-2"><PluginStatus plugin={plugin} />{plugin.index === null && <Badge variant="secondary">{i18n.text(messages.builtIn)}</Badge>}</span>
          </ItemContent>
        </motion.button>
      </Item>)}
    </div>
    {!list.length && !manager.busy && <p className="type-caption py-6 text-center">{i18n.text(messages.noResults)}</p>}
  </section>;
}

/** 页面的通信随卸载取消；页面打开的浮岛按插件身份隔离，并随页面卸载关闭。 */
function SettingsBody({ pluginId, page, location }: { pluginId: string; page: PluginSettingsPage; location?: string }) {
  const Body = page.Body;
  return <PluginCallScope><PluginIslandProvider pluginId={pluginId} page>
    <Body location={location} />
  </PluginIslandProvider></PluginCallScope>;
}
export function PluginDetails({ plugin, manager, location }: { plugin: PluginInfo; manager: PluginManager; location?: string }) {
  const i18n = useI18n();
  const [pageGeneration, setPageGeneration] = useState(0);
  const registry = usePluginSettingsRegistry();
  const page = plugin.id ? registry.pages.get(plugin.id) : undefined;
  const failure = plugin.id ? registry.failures.get(plugin.id) : undefined;
  const available = pluginStatus(plugin, registry.failures) === "loaded";
  const index = plugin.index;
  return <div className="flex flex-col gap-5">
    {plugin.metadata.description && <p className="type-body text-muted-foreground">{i18n.text(plugin.metadata.description)}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <PluginStatus plugin={plugin} /><span className="type-caption">{[plugin.metadata.author, plugin.metadata.version].filter(Boolean).join(" · ")}</span>
      {index === null ? <Badge variant="secondary">{i18n.text(messages.builtIn)}</Badge> : <div className="ml-auto flex items-center gap-3">
        <Switch checked={plugin.enabled} disabled={manager.busy} aria-label={i18n.formatMessage(messages.enablePlugin, { plugin_name: plugin.id ?? plugin.source })}
          onCheckedChange={enabled => { void manager.run({ type: "plugin.enable", index, enabled }); }} />
        <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive" disabled={manager.busy}>{i18n.text(messages.remove)}</Button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{i18n.text(messages.removeTitle)}</AlertDialogTitle><AlertDialogDescription>{i18n.text(messages.removeHint)}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>{i18n.text(messages.cancel)}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { void manager.run({ type: "plugin.remove", index }); }}>{i18n.text(messages.remove)}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>}
    </div>
    <p className="type-caption break-all">{plugin.id}<br />{plugin.source}</p>
    <PluginFeedback manager={manager} />
    {(plugin.error || failure) && <Alert variant="destructive"><AlertDescription className="select-text break-words">{plugin.error ?? failure}</AlertDescription></Alert>}
    {available && page && plugin.id ? <SettingsBoundary key={`${plugin.id}:${pageGeneration}`} fallback={<Alert variant="destructive"><AlertDescription>{i18n.text(messages.pageFailed)}
      <Button variant="outline" size="sm" onClick={() => setPageGeneration(value => value + 1)}>{i18n.text(messages.retry)}</Button>
    </AlertDescription></Alert>}>
      <RendererPreferencesProvider value={pluginPreferences(plugin.id)}>
        <SettingsBody pluginId={plugin.id} page={page} location={location} />
      </RendererPreferencesProvider>
    </SettingsBoundary> : <p className="type-caption">{i18n.text(available ? messages.noPage : messages.pageUnavailable)}</p>}
  </div>;
}
