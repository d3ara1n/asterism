import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { s } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import type { AppSnapshot, Command } from "../../../shared/contracts";
import type { PluginConfiguration, PluginConfigurationCommand } from "../../../shared/plugin-configuration";
import { PluginConfigurations } from "./PluginConfigurations";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { Spinner } from "../../shared/ui/spinner";
import { Separator } from "../../shared/ui/separator";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../../shared/ui/empty";

type Plugins = { list: AppSnapshot["plugins"]; restartRequired: boolean };
/** 插件包管理：添加的是包根，启用、禁用与移除均在重启后生效。 */
let state: Plugins = { list: [], restartRequired: false };
const listeners = new Set<() => void>();
const set = (next: Plugins) => { state = next; listeners.forEach(l => l()); };
async function run(command: Command): Promise<string | null> {
  const result = await window.host.execute(command);
  if (!result.ok) return result.error.message;
  set({ list: result.snapshot.plugins, restartRequired: result.snapshot.restartRequired });
  return null;
}
const statusLabel: Record<AppSnapshot["plugins"][number]["status"], string> = {
  loaded: s("Loaded", "已加载"), disabled: s("Disabled", "已禁用"), invalid: s("Invalid package", "无效包"),
  failed: s("Failed", "加载失败"), pending: s("Takes effect after restart", "重启后生效"),
};

export function PluginsSettings() {
  const { list, restartRequired } = useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => state);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void run({ type: "workspace.read" }).then(setError); }, []);
  const act = (command: Command) => { void run(command).then(setError); };
  const add = async () => {
    const path = await window.host.pickDirectory();
    if (path) act({ type: "plugin.add", path });
  };
  return <div className="flex flex-col gap-3 py-4">
    <p className="type-caption text-muted-foreground">{s("Add a package folder that contains an Atelier manifest. Changes take effect after restarting.", "添加含 Atelier 清单的包目录；改动在重启后生效。")}</p>
    {restartRequired && <p className="type-caption" role="status">{s("Restart Atelier to apply plugin changes.", "重启工坊以应用插件改动。")}</p>}
    {error && <p className="type-caption text-destructive" role="alert">{error}</p>}
    <ul className="flex flex-col gap-2" aria-label={s("Plugin packages", "插件包")}>
      {list.map(item => <li key={item.index} className="flex items-start gap-3 rounded-md border p-3">
        <div className="min-w-0 flex-1">
          <p className="type-label truncate">{item.id ?? s("Unknown plugin", "未知插件")}</p>
          <p className="type-caption truncate text-muted-foreground" title={item.source}>{item.source}</p>
          <p className="type-caption">{statusLabel[item.status]}</p>
          {item.error && <p className="type-caption select-text break-words text-destructive">{item.error}</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={() => act({ type: "plugin.enable", index: item.index, enabled: !item.enabled })}>
          {item.enabled ? s("Disable", "禁用") : s("Enable", "启用")}</Button>
        <Button variant="ghost" size="sm" onClick={() => act({ type: "plugin.remove", index: item.index })}>{s("Remove", "移除")}</Button>
      </li>)}
    </ul>
    <div><Button onClick={() => { void add(); }}>{s("Add package…", "添加包…")}</Button></div>
    <Separator />
    <ConfigurationSection />
  </div>;
}

function ConfigurationSection() {
  const [values, setValues] = useState<PluginConfiguration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      else setError(result.error.message);
    } catch {
      if (token === generation.current) setError(s("Plugin settings could not be loaded.", "无法读取插件设置。"));
    } finally { if (token === generation.current) setLoading(false); }
  }, [execute]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  const saved = (next: PluginConfiguration[]) => {
    generation.current++; setValues(next); setLoading(false); setError(null);
  };
  return <section className="flex flex-col gap-4" aria-label={s("Plugin settings", "插件设置")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="type-section">{s("Plugin settings", "插件设置")}</h3>
      <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => { void load(); }}>
        {loading && <Spinner data-icon="inline-start" />}{s("Reload", "重新读取")}
      </Button>
    </div>
    <p className="type-caption">{s("Settings are provided by active plugins. Changes, including restored defaults, apply when saved.", "这里显示当前运行插件的设置。修改与恢复默认值均在保存后生效。")}</p>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {values && values.length > 0 && <PluginConfigurations values={values} execute={execute} onSaved={saved} />}
    {values?.length === 0 && <Empty><EmptyHeader>
      <EmptyTitle>{s("No plugin settings", "暂无插件设置")}</EmptyTitle>
      <EmptyDescription>{s("Active plugins have not declared any settings.", "当前运行的插件尚未声明可配置项。")}</EmptyDescription>
    </EmptyHeader></Empty>}
  </section>;
}
