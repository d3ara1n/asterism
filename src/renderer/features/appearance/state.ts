import { useSyncExternalStore } from "react";
import { defaultAppearance, densityRootPx, themeTokens, type Appearance, type AppearancePatch } from "../../../shared/theme";

/** 外观的唯一 renderer 入口：读取、写入并把 token 应用到 :root。 */
let current: Appearance = defaultAppearance;
const listeners = new Set<() => void>();

function apply(appearance: Appearance) {
  current = appearance;
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(themeTokens(appearance))) root.setProperty(`--${name}`, value);
  root.fontSize = `${densityRootPx[appearance.density]}px`;
  listeners.forEach(listener => listener());
}

export function startAppearance(): void {
  void window.weft.appearance.get().then(apply).catch(error => console.error("Appearance settings could not be loaded.", error));
  window.weft.appearance.onChanged(apply);
}

export async function updateAppearance(patch: AppearancePatch): Promise<void> {
  try { apply(await window.weft.appearance.set(patch)); }
  catch (error) { console.error("Appearance settings could not be saved.", error); }
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => current);
}
