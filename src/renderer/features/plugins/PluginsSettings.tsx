import type { UiText } from "@atelier/sdk/contracts";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { AppSnapshot, Command } from "../../../shared/contracts";
import { errorDisplay } from "../../../shared/error-display.ts";
import type { PluginConfiguration, PluginConfigurationCommand } from "../../../shared/plugin-configuration";
import { pluginsMessages } from "../../messages/plugins";
import { getI18n, useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Button } from "../../shared/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../../shared/ui/empty";
import { Separator } from "../../shared/ui/separator";
import { Spinner } from "../../shared/ui/spinner";
import { PluginConfigurations } from "./PluginConfigurations";

type Plugins = { list: AppSnapshot["plugins"]; restartRequired: boolean };
/** 插件包管理：添加的是包根，启用、禁用与移除均在重启后生效。 */
let state: Plugins = { list: [], restartRequired: false };
const listeners = new Set<() => void>();
const set = (next: Plugins) => { state = next; listeners.forEach(l => l()); };
async function run(command: Command): Promise<UiText | null> {
  const result = await window.host.execute(command);
  if (!result.ok) return errorDisplay(result.error);
  set({ list: result.snapshot.plugins, restartRequired: result.snapshot.restartRequired });
  return null;
}
const statusLabels = (): Record<AppSnapshot["plugins"][number]["status"], string> => ({
  loaded: getI18n().formatMessage(pluginsMessages.loaded), disabled: getI18n().formatMessage(pluginsMessages.disabled), invalid: getI18n().formatMessage(pluginsMessages.invalidPackage),
  failed: getI18n().formatMessage(pluginsMessages.failed), pending: getI18n().formatMessage(pluginsMessages.restartRequired),
});

export function PluginsSettings() {
  const i18n = useI18n();
  const { list, restartRequired } = useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => state);
  const [error, setError] = useState<UiText | null>(null);
  useEffect(() => { void run({ type: "workspace.read" }).then(setError); }, []);
  const act = (command: Command) => { void run(command).then(setError); };
  const add = async () => {
    const path = await window.host.pickDirectory();
    if (path) act({ type: "plugin.add", path });
  };
  return <div className="flex flex-col gap-3 py-4">
    <p className="type-caption text-muted-foreground">{i18n.formatMessage(pluginsMessages.addPackageHint)}</p>
    {restartRequired && <p className="type-caption" role="status">{i18n.formatMessage(pluginsMessages.restartHint)}</p>}
    {error && <p className="type-caption text-destructive" role="alert">{i18n.text(error)}</p>}
    <ul className="flex flex-col gap-2" aria-label={i18n.formatMessage(pluginsMessages.packages)}>
      {list.map(item => <li key={item.index} className="flex items-start gap-3 rounded-md border p-3">
        <div className="min-w-0 flex-1">
          <p className="type-label truncate">{item.id ?? i18n.formatMessage(pluginsMessages.unknownPlugin)}</p>
          <p className="type-caption truncate text-muted-foreground" title={item.source}>{item.source}</p>
          <p className="type-caption">{statusLabels()[item.status]}</p>
          {item.error && <p className="type-caption select-text break-words text-destructive">{item.error}</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={() => act({ type: "plugin.enable", index: item.index, enabled: !item.enabled })}>
          {item.enabled ? i18n.formatMessage(pluginsMessages.disable) : i18n.formatMessage(pluginsMessages.enable)}</Button>
        <Button variant="ghost" size="sm" onClick={() => act({ type: "plugin.remove", index: item.index })}>{i18n.formatMessage(pluginsMessages.remove)}</Button>
      </li>)}
    </ul>
    <div><Button onClick={() => { void add(); }}>{i18n.formatMessage(pluginsMessages.addPackage)}</Button></div>
    <Separator />
    <ConfigurationSection />
  </div>;
}

function ConfigurationSection() {
  const i18n = useI18n();
  const [values, setValues] = useState<PluginConfiguration[] | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const execute = useCallback((command: PluginConfigurationCommand) => {
    const operation = queue.current.then(() => window.host.pluginConfiguration.execute(command));
    queue.current = operation.catch(() => {});
    return operation;
  }, []);
  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true); setError(null);
    try {
      const result = await execute({ type: "read" });
      if (token !== generation.current) return;
      if (result.ok) setValues(result.configurations);
      else setError(errorDisplay(result.error));
    } catch {
      if (token === generation.current) setError(pluginsMessages.settingsLoadFailed);
    } finally { if (token === generation.current) setLoading(false); }
  }, [execute]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  const saved = (next: PluginConfiguration[]) => {
    generation.current++; setValues(next); setLoading(false); setError(null);
  };
  return <section className="flex flex-col gap-4" aria-label={i18n.formatMessage(pluginsMessages.settingsTitle)}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="type-section">{i18n.formatMessage(pluginsMessages.settingsLabel)}</h3>
      <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => { void load(); }}>
        {loading && <Spinner data-icon="inline-start" />}{i18n.formatMessage(pluginsMessages.reload)}
      </Button>
    </div>
    <p className="type-caption">{i18n.formatMessage(pluginsMessages.settingsHint)}</p>
    {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
    {values && values.length > 0 && <PluginConfigurations values={values} execute={execute} onSaved={saved} />}
    {values?.length === 0 && <Empty><EmptyHeader>
      <EmptyTitle>{i18n.formatMessage(pluginsMessages.noSettings)}</EmptyTitle>
      <EmptyDescription>{i18n.formatMessage(pluginsMessages.noSettingsHint)}</EmptyDescription>
    </EmptyHeader></Empty>}
  </section>;
}
