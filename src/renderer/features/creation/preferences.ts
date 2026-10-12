import type { Json } from "@atelier/sdk/contracts";
import type { RendererPreferences } from "@atelier/sdk/renderer";

/**
 * 受控偏好容器的 renderer 缓存：启动时读取一次，写入先更新缓存再经桥保存。
 * 宿主路由记忆与插件偏好共用同一容器，按键前缀区分归属。
 */
let cache: Record<string, Json> = {};
let loaded: Promise<void> | null = null;

export function loadPreferences(): Promise<void> {
  loaded ??= window.host.preferences.read().then(value => { cache = { ...value }; }).catch(() => {});
  return loaded;
}
export function readPreference(key: string): Json | null {
  return Object.hasOwn(cache, key) ? cache[key]! : null;
}
export function writePreference(key: string, value: Json | null): void {
  if (value === null) delete cache[key]; else cache[key] = value;
  void window.host.preferences.write(key, value);
}

/** 插件偏好门面：键限定在 `plugin/<pluginId>/` 下，读取按调用方 schema 校验，失效视为缺省。 */
export function pluginPreferences(pluginId: string): RendererPreferences {
  const scoped = (key: string) => `plugin/${pluginId}/${key}`;
  return {
    get(key, schema) {
      const parsed = schema.safeParse(readPreference(scoped(key)));
      return parsed.success ? parsed.data : null;
    },
    set(key, value) { writePreference(scoped(key), value); },
  };
}
