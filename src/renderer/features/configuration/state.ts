import { runtime } from "../../runtime";
import { errorDisplay } from "../../../shared/error-display.ts";
import type { UiText } from "@atelier/sdk/contracts";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ConfigurationCommand, ConfigurationResult, ConfigurationSnapshot } from "../../../shared/configuration";
import { getI18n } from "../../shared/i18n";
import { toast } from "../../shared/toast";

type ConfigurationOperation = Exclude<ConfigurationCommand, { type: "read" }>;
type ConfigurationSuccess = Extract<ConfigurationResult, { ok: true }>;

/** 共享配置快照与读取异常；操作回执只更新成功快照，反馈归发起入口。 */
export function useConfiguration(active: boolean) {
  const [snapshot, setSnapshot] = useState<ConfigurationSnapshot | null>(null);
  const [readError, setReadError] = useState<UiText | null>(null);
  const load = useCallback(async () => {
    const result = await runtime.configuration.execute({ type: "read" });
    if (result.ok) { setSnapshot(result.snapshot); setReadError(null); }
    else setReadError(errorDisplay(result.error));
  }, []);
  useEffect(() => {
    if (!active) return;
    const unsubscribe = runtime.configuration.onChanged(() => { void load(); });
    void load();
    return unsubscribe;
  }, [active, load]);
  const execute = useCallback(async (command: ConfigurationOperation): Promise<ConfigurationResult> => {
    const result = await runtime.configuration.execute(command);
    if (result.ok) setSnapshot(result.snapshot);
    return result;
  }, []);
  return { snapshot, readError, load, execute };
}
export type ConfigurationState = ReturnType<typeof useConfiguration>;
export const ConfigurationContext = createContext<ConfigurationState | null>(null);
function useConfigurationContext(): ConfigurationState {
  const value = useContext(ConfigurationContext);
  if (!value) throw new Error("Configuration context is unavailable.");
  return value;
}

/** 读取入口只取得数据与读取状态；配置操作通过 useConfigurationAction 声明反馈归属。 */
export function useSettingsConfiguration(): Pick<ConfigurationState, "snapshot" | "readError" | "load"> {
  const { snapshot, readError, load } = useConfigurationContext();
  return { snapshot, readError, load };
}

/**
 * 每个表单、区块或快捷操作持有独立实例，busy 只阻止该入口重入。
 * inline 由调用处呈现 error；toast 由本 hook 提示。反馈通道为必填项。
 * run 返回成功回执，失败或重复进入返回 null；失败反馈已在选定通道承接。
 */
export function useConfigurationAction(feedback: "inline" | "toast") {
  const { execute } = useConfigurationContext();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const run = async (command: ConfigurationOperation): Promise<ConfigurationSuccess | null> => {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await execute(command);
      if (result.ok) return result;
      const message = errorDisplay(result.error);
      if (feedback === "inline") setError(message);
      else toast.error(getI18n().text(message));
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { run, busy, error };
}
