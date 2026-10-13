import { readConfig, type Json } from "@atelier/sdk/contracts";
import { RendererConfigsProvider, type RendererConfigs } from "@atelier/sdk/renderer";
import { useEffect, useMemo, useState, type ReactNode } from "react";

/** 宿主读取全部插件配置，变更通道到达时重读；插件按自己的契约解码，不读取原始存储。 */
export function HostConfigsProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<ReadonlyMap<string, Json>>(new Map());
  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await window.host.pluginConfiguration.execute({ type: "read" });
      if (active && result.ok) setValues(new Map(result.configurations.map(item => [item.id, item.value])));
    };
    void load();
    const stop = window.host.pluginConfiguration.onChanged(() => { void load(); });
    return () => { active = false; stop(); };
  }, []);
  const value = useMemo<RendererConfigs>(() => ({ get: contract => readConfig(contract, values.get(contract.plugin)) }), [values]);
  return <RendererConfigsProvider value={value}>{children}</RendererConfigsProvider>;
}
