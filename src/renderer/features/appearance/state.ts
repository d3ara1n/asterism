import type { UiText } from "@asterism-app/sdk/contracts";
import { useSettingsAction } from "@asterism-app/ui/use-settings-action";
import { appearanceMessages } from "../../messages/appearance";
import { getI18n } from "../../shared/i18n";
import { toast } from "../../shared/toast";
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
let readState: { ready: boolean; error: UiText | null } = { ready: false, error: null };

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
  readState = { ready: true, error: null };
  render();
}

export function startAppearance(): void {
  render();
  darkQuery.addEventListener("change", event => { scheme = event.matches ? "dark" : "light"; render(); });
  window.host.appearance.onChanged(apply);
  void refreshAppearance();
}

export async function updateAppearance(patch: AppearancePatch): Promise<void> {
  apply(await window.host.appearance.set(patch));
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current);
}

/** Currently resolved light/dark mode for components requiring an explicit mode, such as React Flow colorMode. */
export function useScheme(): Scheme {
  return useSyncExternalStore(subscribe, () => scheme);
}

/** Default tokens remain usable during startup; settings expose read failures and retry explicitly. */
export async function refreshAppearance(): Promise<void> {
  try { apply(await window.host.appearance.get()); }
  catch {
    readState = { ...readState, error: appearanceMessages.loadFailed };
    listeners.forEach(listener => listener());
  }
}
export function useAppearanceReadState() {
  return useSyncExternalStore(subscribe, () => readState);
}
/** Feedback belongs to the control entry, not the appearance store. */
export function useAppearanceAction() {
  const action = useSettingsAction(appearanceMessages.saveFailed, message => toast.error(getI18n().text(message)));
  return { busy: action.busy, save: async (patch: AppearancePatch) => !!await action.run(() => updateAppearance(patch)) };
}
