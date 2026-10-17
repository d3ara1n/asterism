import { StrictMode } from "react";
import { RendererEventsProvider, RendererCallsProvider } from "@atelier/sdk/renderer";
import { EventClient } from "../shared/event-client";
import { CallClient } from "../shared/call-client";
import { HostI18nProvider, startLanguage } from "./shared/i18n";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@atelier/ui/ui/tooltip";
import { ModuleViewsProvider } from "./modules/views";
import { HostConfigsProvider } from "./modules/configs";
import { App } from "./app/App";

import { createRoot } from "react-dom/client";

import { ApplicationController } from "./app/controller";

import "./styles.css";

import { startAppearance } from "./features/appearance/state";

import { builtinRenderer, BuiltinRendererProvider } from "@atelier/builtin/renderer";
import * as builtinRendererAPI from "@atelier/builtin-api/renderer";
import { ViewRegistry } from "./modules/registry";
import { workbenchRecordViews } from "./features/workbench/records";
import { loadPluginRenderers } from "./modules/plugins";
import { loadPreferences, pluginPreferences } from "./features/creation/preferences";
import { preparePlugin, showStartupStage } from "./app/startup";
import { PluginSettingsProvider } from "./modules/settings";
import type { PluginSettingsPage } from "@atelier/sdk/renderer";
import { getI18n } from "./shared/i18n";
import { appMessages } from "./messages/app";
import { builtin } from "@atelier/builtin-api/contracts";
import { bindPublicProvider } from "../shared/public-modules";
import { builtinPublicProvider, builtinPublicModules } from "../builtin-public";

startAppearance();
const events = new EventClient(window.host.events);
const calls = new CallClient(window.host.calls);
const controller = new ApplicationController(window.host, events);
const lifetime = new AbortController();
const stopEventStatus = window.host.onStatus(status => { if (status !== "ready") { events.disconnect(); calls.disconnect(); } });
window.addEventListener("pagehide", () => { lifetime.abort(); events.close(); calls.close(); stopEventStatus(); }, { once: true });
// 插件视图只在启动时加载；内置视图之后合并，重复契约使该插件视图被忽略。
const initial = await window.host.execute({ type: "workspace.read" }).catch(() => null);
await startLanguage(initial?.ok ? initial.snapshot.catalogs ?? [] : []).catch(error => console.error("Language settings could not be loaded. English is used.", error));
showStartupStage(getI18n().formatMessage(appMessages.startupPlugins));
const plugins = initial?.ok ? initial.snapshot.plugins.flatMap(p => p.status === "loaded" && p.id ? [{ id: p.id, renderer: p.renderer, dependencies: p.dependencies }] : []) : [];
const accepted = [...builtinRenderer.modules ?? [], workbenchRecordViews];
const pages = new Map<string, PluginSettingsPage>();
const cleanup: (() => Promise<void>)[] = [];
window.addEventListener("pagehide", () => { void (async () => {
  for (const close of cleanup.reverse()) {
    try { await close(); } catch (error) { console.error("Renderer plugin cleanup failed.", error); }
  }
})(); }, { once: true });
await preparePlugin(builtinRenderer, events, lifetime.signal, undefined, close => cleanup.push(close));
if (builtinRenderer.settings) pages.set(builtin.id, builtinRenderer.settings);
new ViewRegistry(accepted);
const releasePublic = bindPublicProvider("renderer", builtinPublicProvider, {
  ...builtinPublicModules,
  "@atelier/builtin-api/renderer": builtinRendererAPI,
});
window.addEventListener("pagehide", releasePublic, { once: true });
const rendererPlugins = await loadPluginRenderers(plugins, { available: [builtin.id], async accept(plugin, id) {
  new ViewRegistry([...accepted, ...plugin.modules ?? []]);
  await preparePlugin(plugin, events, lifetime.signal, undefined, close => cleanup.push(close));
  accepted.push(...plugin.modules ?? []);
  if (plugin.settings) pages.set(id, plugin.settings);
} });
const moduleViews = new ViewRegistry(accepted);
const builtinRendererServices = { preferences: pluginPreferences };
showStartupStage(getI18n().formatMessage(appMessages.startupEnvironment));
await loadPreferences();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HostI18nProvider>
      <ErrorBoundary>
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            <RendererEventsProvider value={events}>
              <RendererCallsProvider value={calls}>
                <HostConfigsProvider>
                  <ModuleViewsProvider registry={moduleViews}>
                    <BuiltinRendererProvider services={builtinRendererServices}>
                      <PluginSettingsProvider value={{ pages, failures: new Map(rendererPlugins.failures.map(failure => [failure.id, failure.error])) }}>
                        <App controller={controller} />
                      </PluginSettingsProvider>
                    </BuiltinRendererProvider>
                  </ModuleViewsProvider>
                </HostConfigsProvider>
              </RendererCallsProvider>
            </RendererEventsProvider>
          </TooltipProvider>
        </MotionConfig>
      </ErrorBoundary>
    </HostI18nProvider>
  </StrictMode>,
);
