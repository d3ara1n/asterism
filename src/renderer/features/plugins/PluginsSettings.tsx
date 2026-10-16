import type { UiText } from "@atelier/sdk/contracts";
import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Plus, RefreshCw } from "lucide-react";

import type { AppSnapshot, Command } from "../../../shared/contracts";
import { errorDisplay } from "../../../shared/error-display.ts";
import type { PluginConfiguration, PluginConfigurationCommand } from "../../../shared/plugin-configuration";
import { pluginsMessages } from "../../messages/plugins";
import { getI18n, useI18n } from "../../shared/i18n";
import { Alert, AlertDescription } from "@atelier/ui/ui/alert";
import { StatusBadge, type StatusTone } from "@atelier/ui/ui/status";
import { Button } from "@atelier/ui/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@atelier/ui/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@atelier/ui/ui/item";
import { Spinner } from "@atelier/ui/ui/spinner";
import { Switch } from "@atelier/ui/ui/switch";
import { Section } from "../settings/layout";
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
const statusTones: Record<AppSnapshot["plugins"][number]["status"], StatusTone> = {
  loaded: "success", disabled: "neutral", invalid: "error", failed: "error", pending: "warning",
};

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
  return <div className="flex flex-col pb-4">
    <Section title={i18n.formatMessage(pluginsMessages.packages)} hint={i18n.formatMessage(pluginsMessages.addPackageHint)}
      action={<Button size="sm" onClick={() => { void add(); }}><Plus />{i18n.formatMessage(pluginsMessages.addPackage)}</Button>}>
      <div className="flex flex-col gap-3">
        {restartRequired && <Alert role="status"><AlertDescription>{i18n.formatMessage(pluginsMessages.restartHint)}</AlertDescription></Alert>}
        {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
        {list.length > 0 && <ItemGroup className="surface" aria-label={i18n.formatMessage(pluginsMessages.packages)}>
          {list.map((item, index) => <Fragment key={item.index}>
            {index > 0 && <ItemSeparator />}
            <Item role="listitem">
              <ItemContent className="min-w-0">
                <ItemTitle className="max-w-full flex-wrap">
                  <span className="break-all">{item.id ?? i18n.formatMessage(pluginsMessages.unknownPlugin)}</span>
                  <StatusBadge tone={statusTones[item.status]}>{statusLabels()[item.status]}</StatusBadge>
                </ItemTitle>
                <ItemDescription className="break-all" title={item.source}>{item.source}</ItemDescription>
                {item.error && <Alert variant="destructive"><AlertDescription className="select-text break-words">{item.error}</AlertDescription></Alert>}
              </ItemContent>
              <ItemActions className="flex-wrap">
                <Switch aria-label={i18n.formatMessage(pluginsMessages.enablePlugin, { plugin_name: item.id ?? item.source })} checked={item.enabled}
                  onCheckedChange={enabled => act({ type: "plugin.enable", index: item.index, enabled })} />
                <Button variant="ghost" size="sm" onClick={() => act({ type: "plugin.remove", index: item.index })}>{i18n.formatMessage(pluginsMessages.remove)}</Button>
              </ItemActions>
            </Item>
          </Fragment>)}
        </ItemGroup>}
      </div>
    </Section>
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
  return <Section title={i18n.formatMessage(pluginsMessages.settingsLabel)} hint={i18n.formatMessage(pluginsMessages.settingsHint)}
    action={<Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => { void load(); }}>
      {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}{i18n.formatMessage(pluginsMessages.reload)}
    </Button>}>
    <div className="flex flex-col gap-4">
      {error && <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>}
      {values && values.length > 0 && <PluginConfigurations values={values} execute={execute} onSaved={saved} />}
      {values?.length === 0 && <Empty><EmptyHeader>
        <EmptyTitle>{i18n.formatMessage(pluginsMessages.noSettings)}</EmptyTitle>
        <EmptyDescription>{i18n.formatMessage(pluginsMessages.noSettingsHint)}</EmptyDescription>
      </EmptyHeader></Empty>}
    </div>
  </Section>;
}
