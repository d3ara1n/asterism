import { useSyncExternalStore } from "react";
import { defaultAppearance, densityRootPx, fontStack, monoStack, sansStack, themeTokens, type Appearance, type AppearancePatch, type Scheme } from "../../../shared/theme";

/**
 * The sole renderer entry for appearance: reads, writes, and applies tokens to :root.
 * Light/dark mode is determined by nativeTheme.themeSource in the main process; this only reads prefers-color-scheme, sharing the native material's source.
 */
let current: Appearance = defaultAppearance(window.host.platform);
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let scheme: Scheme = darkQuery.matches ? "dark" : "light";
const listeners = new Set<() => void>();

function render() {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeTokens(current, scheme))) root.style.setProperty(`--${name}`, value);
  root.style.setProperty("--app-font-sans", fontStack(current.uiFont, sansStack));
  root.style.setProperty("--app-font-terminal", fontStack(current.terminalFont, monoStack));
  root.style.setProperty("--terminal-font-size", `${current.terminalFontSize}px`);
  root.style.setProperty("--app-font-mono", fontStack(current.codeFont, monoStack));
  if (current.codeFontSize) root.style.setProperty("--code-font-size", `${current.codeFontSize}px`);
  else root.style.removeProperty("--code-font-size");
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
  void window.host.appearance.get().then(apply).catch(error => console.error("Appearance settings could not be loaded.", error));
  window.host.appearance.onChanged(apply);
}

export async function updateAppearance(patch: AppearancePatch): Promise<void> {
  try { apply(await window.host.appearance.set(patch)); }
  catch (error) { console.error("Appearance settings could not be saved.", error); }
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current);
}

/** Currently resolved light/dark mode for components requiring an explicit mode, such as React Flow colorMode. */
export function useScheme(): Scheme {
  return useSyncExternalStore(subscribe, () => scheme);
}
