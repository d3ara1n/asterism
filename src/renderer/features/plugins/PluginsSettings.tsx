import { runtime } from "../../runtime";
import { pluginName } from "../../../shared/plugin-name";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Puzzle, RefreshCw } from "lucide-react";
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

export type PluginInfo = AppSnapshot["plugins"][number];
const tones: Record<PluginInfo["status"], StatusTone> = { loaded: "success", disabled: "neutral", invalid: "error", failed: "error", pending: "warning" };
const labels = { loaded: messages.loaded, disabled: messages.disabled, invalid: messages.invalidPackage, failed: messages.failed, pending: messages.restartRequired };
function pluginStatus(plugin: PluginInfo, failures: ReadonlyMap<string, string>): PluginInfo["status"] {
  return plugin.status === "loaded" && plugin.id && failures.has(plugin.id) ? "failed" : plugin.status;
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
  useEffect(() => { if (active) void run({ type: "workspace.read" }); }, [active, run]);
  const add = async () => {
    try { const path = await window.host.pickDirectory(); if (path) await run({ type: "plugin.add", path }); }
    catch { setError(messages.operationFailed); }
  };
  return { list: snapshot?.plugins ?? [], restartRequired: snapshot?.restartRequired ?? false, busy, error, run, add };
}
export type PluginManager = ReturnType<typeof usePlugins>;

export function PluginsSettings({ manager }: { manager: PluginManager }) {
  const i18n = useI18n();
  const { failures } = usePluginSettingsRegistry();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const search = query.trim().toLocaleLowerCase();
  const list = manager.list.filter(plugin => {
    const status = pluginStatus(plugin, failures);
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
    {manager.restartRequired && <Alert role="status"><AlertDescription>{i18n.text(messages.restartHint)}</AlertDescription></Alert>}
    {manager.error && <Alert variant="destructive"><AlertDescription>{i18n.text(manager.error)}<Button variant="outline" size="sm" disabled={manager.busy} onClick={() => { void manager.run({ type: "workspace.read" }); }}><RefreshCw />{i18n.text(messages.retry)}</Button></AlertDescription></Alert>}
    <ItemGroup>
      {list.map(plugin => {
        const status = pluginStatus(plugin, failures);
        const failure = plugin.error ?? (plugin.id ? failures.get(plugin.id) : undefined);
        const index = plugin.index;
        return <Item key={plugin.source} className="items-start border-b last:border-b-0">
          {plugin.metadata.icon ? <img src={plugin.metadata.icon} alt="" className="size-8 shrink-0 object-contain" /> : <Puzzle className="size-8 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <ItemContent className="min-w-0">
            <ItemTitle>{i18n.text(pluginName(plugin))}</ItemTitle>
            {plugin.metadata.description && <ItemDescription className="text-wrap">{i18n.text(plugin.metadata.description)}</ItemDescription>}
            <p className="type-caption">{[plugin.metadata.author, plugin.metadata.version].filter(Boolean).join(" · ")}</p>
            <p className="type-caption break-all">{plugin.id}<br />{plugin.source}</p>
            <div className="flex flex-wrap gap-2"><StatusBadge tone={tones[status]}>{i18n.text(labels[status])}</StatusBadge>{plugin.bundled && <Badge variant="secondary">{i18n.text(messages.builtIn)}</Badge>}</div>
            {failure && <Alert variant="destructive"><AlertDescription className="select-text break-words">{failure}</AlertDescription></Alert>}
          </ItemContent>
          <ItemActions>
            <Switch checked={plugin.enabled} disabled={manager.busy} aria-label={i18n.formatMessage(messages.enablePlugin, { plugin_name: i18n.text(pluginName(plugin)) })}
              onCheckedChange={enabled => { void manager.run({ type: "plugin.enable", index, enabled }); }} />
            <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive" disabled={manager.busy}>{i18n.text(messages.remove)}</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{i18n.text(messages.removeTitle)}</AlertDialogTitle><AlertDialogDescription>{i18n.text(messages.removeHint)}</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>{i18n.text(messages.cancel)}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { void manager.run({ type: "plugin.remove", index }); }}>{i18n.text(messages.remove)}</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </ItemActions>
        </Item>;
      })}
    </ItemGroup>
    {!list.length && !manager.busy && <p className="type-caption py-6 text-center">{i18n.text(messages.noResults)}</p>}
  </div>;
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
