import { useSyncExternalStore } from "react";
import { defaultAppearance, densityRootPx, themeTokens, type Appearance, type AppearancePatch, type Scheme } from "../../../shared/theme";

/**
 * 外观的唯一 renderer 入口：读取、写入并把 token 应用到 :root。
 * 亮暗由主进程 nativeTheme.themeSource 决定，这里只读 prefers-color-scheme，与系统材质同源。
 */
let current: Appearance = defaultAppearance;
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let scheme: Scheme = darkQuery.matches ? "dark" : "light";
const listeners = new Set<() => void>();

function render() {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeTokens(current, scheme))) root.style.setProperty(`--${name}`, value);
  root.style.fontSize = `${densityRootPx[current.density]}px`;
  root.style.colorScheme = scheme;
  root.dataset.mode = scheme;
  listeners.forEach(listener => listener());
}

function apply(appearance: Appearance) {
  current = appearance;
  render();
}

export function startAppearance(): void {
  render();
  darkQuery.addEventListener("change", event => { scheme = event.matches ? "dark" : "light"; render(); });
  void window.weft.appearance.get().then(apply).catch(error => console.error("Appearance settings could not be loaded.", error));
  window.weft.appearance.onChanged(apply);
}

export async function updateAppearance(patch: AppearancePatch): Promise<void> {
  try { apply(await window.weft.appearance.set(patch)); }
  catch (error) { console.error("Appearance settings could not be saved.", error); }
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current);
}

/** 当前解析后的亮暗，供 React Flow colorMode 等需要显式模式的组件使用。 */
export function useScheme(): Scheme {
  return useSyncExternalStore(subscribe, () => scheme);
}
