import { runtime } from "../runtime";
import { readConfig, type UiText } from "@asterism-app/sdk/contracts";
import { RendererConfigsProvider, type RendererConfigs } from "@asterism-app/sdk/renderer";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PluginConfiguration, PluginConfigurationCommand } from "../../shared/plugin-configuration";
import { errorDisplay } from "../../shared/error-display";
import { pluginsMessages } from "../messages/plugins";

/** Configuration reads and writes are serialized, with subscription preceding the initial read; old reads do not overwrite newly saved results. */
export function HostConfigsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ values: Map<string, PluginConfiguration>; ready: boolean; error: UiText | null }>({ values: new Map(), ready: false, error: null });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const execute = useMemo(() => (command: PluginConfigurationCommand) => {
    const operation = queue.current.then(() => runtime.pluginConfiguration.execute(command));
    queue.current = operation.catch(() => {});
    return operation;
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await execute({ type: "read" });
        if (!active) return;
        if (result.ok) setState({ values: new Map(result.configurations.map(item => [item.id, item])), ready: true, error: null });
        else setState(previous => ({ ...previous, ready: false, error: errorDisplay(result.error) }));
      } catch {
        if (active) setState(previous => ({ ...previous, ready: false, error: pluginsMessages.settingsLoadFailed }));
      }
    };
    const stop = runtime.pluginConfiguration.onChanged(() => { void load(); });
    void load();
    return () => { active = false; stop(); };
  }, [execute]);
  const value = useMemo<RendererConfigs>(() => {
    const refreshAfter = async (command: PluginConfigurationCommand) => {
      const result = await execute(command);
      if (!result.ok) throw Object.assign(new Error(result.error.message), { display: errorDisplay(result.error) });
      setState({ values: new Map(result.configurations.map(item => [item.id, item])), ready: true, error: null });
    };
    return {
      get: contract => {
        const saved = state.values.get(contract.plugin);
        const decoded = readConfig(contract, saved?.value);
        const status = saved?.status === "invalid" || decoded.status === "invalid" ? "invalid" : saved?.status ?? "defaults";
        return { ...decoded, status,
          ready: state.ready && !!saved, error: state.error ?? (state.ready && !saved ? pluginsMessages.configurationUnavailable : null) };
      },
      save: (contract, next) => refreshAfter({ type: "save", id: contract.plugin, value: next }),
      reset: contract => refreshAfter({ type: "reset", id: contract.plugin }),
      refresh: () => refreshAfter({ type: "read" }),
    };
  }, [state, execute]);
  return <RendererConfigsProvider value={value}>{children}</RendererConfigsProvider>;
}
