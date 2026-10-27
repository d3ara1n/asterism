import type { Json } from "@asterism-app/sdk/contracts";
import type { RendererPreferences } from "@asterism-app/sdk/renderer";

/**
 * Renderer cache of the controlled preferences container: read once at startup; writes update the cache before saving through the bridge.
 * Host routing memory and plugin preferences share one container, with ownership distinguished by key prefixes.
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

/** Plugin preferences facade: keys are restricted to `plugin/<pluginId>/`; reads validate against the caller's schema, treating invalid values as unset. */
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
