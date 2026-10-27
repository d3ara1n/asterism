import { StrictMode, useEffect } from "react";
import { RendererEventsProvider, RendererCallsProvider } from "@asterism-app/sdk/renderer";
import { EventClient } from "../shared/event-client";
import { CallClient } from "../shared/call-client";
import { HostI18nProvider, setLanguageCatalogs } from "./shared/i18n";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@asterism-app/ui/ui/tooltip";
import { ModuleViewsProvider } from "./modules/views";
import { HostConfigsProvider } from "./modules/configs";
import { App } from "./app/App";

import type { Root } from "react-dom/client";

import { ApplicationController } from "./app/controller";

import { builtinRenderer, BuiltinRendererProvider } from "@asterism-app/builtin/renderer";
import * as builtinRendererAPI from "@asterism-app/builtin-api/renderer";
import { ViewRegistry } from "./modules/registry";
import { workbenchRecordViews } from "./features/workbench/records";
import { loadPluginRenderers } from "./modules/plugins";
import { pluginPreferences } from "./features/creation/preferences";
import { preparePlugin } from "./app/startup";
import { PluginSettingsProvider } from "./modules/settings";
import type { PluginSettingsPage } from "@asterism-app/sdk/renderer";
import { getI18n, useI18n } from "./shared/i18n";
import { toast } from "./shared/toast";
import { startupMessages } from "../shared/error-display";
import type { UiText } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";
import { bindPublicProvider } from "../shared/public-modules";
import { builtinPublicProvider, builtinPublicModules } from "../builtin-public";

import { runtime } from "./runtime";

/** Retrieve startup notices once after the home page mounts: plugins disabled due to storage preparation failure appear as persistent errors. */
function StartupNotification() {
  const i18n = useI18n();
  useEffect(() => {
    void window.host.startup.initialized().then(failures => {
      for (const failure of failures) toast.error(i18n.text({ ...startupMessages.pluginStorageFailed, values: failure }),
        { id: `plugin-storage:${failure.id}`, duration: Infinity, closeButton: true });
    }).catch(error => console.error("Startup notifications could not be read.", error));
  }, [i18n]);
  return null;
}
/** Load the workbench and plugins after the lightweight startup page appears; the application controller stays subscribed from the initial read onward. */
export async function startApplication(root: Root, progress: (message: UiText, detail?: string) => void, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const events = new EventClient(runtime.events);
  const calls = new CallClient(runtime.calls);
  const controller = new ApplicationController({ execute: runtime.execute, session: runtime.session, onStatus: window.host.onStatus }, events);
  const stopEventStatus = window.host.onStatus(status => { if (status !== "ready") { events.disconnect(); calls.disconnect(); } });
  signal.addEventListener("abort", () => { events.close(); calls.close(); stopEventStatus(); }, { once: true });
  const stopController = controller.connect({ read: false });
  signal.addEventListener("abort", stopController, { once: true });
  // Plugin views load only at startup; built-in views are merged afterward, and duplicate contracts cause the plugin's views to be ignored.
  await controller.refresh();
  signal.throwIfAborted();
  const initial = controller.getSnapshot();
  if (!initial.snapshot || initial.error) throw new Error(initial.error ? getI18n().text(initial.error) : "The workspace could not be read.");
  setLanguageCatalogs(initial.snapshot.catalogs ?? []);
  progress(startupMessages.plugins);
  const plugins = initial.snapshot.plugins.flatMap(p => p.status === "loaded" && p.id ? [{ id: p.id, renderer: p.renderer, stylesheet: p.stylesheet, dependencies: p.dependencies }] : []);
  const accepted = [...builtinRenderer.modules ?? [], workbenchRecordViews];
  const pages = new Map<string, PluginSettingsPage>();
  const cleanup: (() => Promise<void>)[] = [];
  signal.addEventListener("abort", () => { void (async () => {
    for (const close of cleanup.reverse()) {
      try { await close(); } catch (error) { console.error("Renderer plugin cleanup failed.", error); }
    }
  })(); }, { once: true });
  await preparePlugin(builtinRenderer, events, signal, undefined, close => cleanup.push(close), calls);
  if (builtinRenderer.settings) pages.set(builtin.id, builtinRenderer.settings);
  new ViewRegistry(accepted);
  const releasePublic = bindPublicProvider("renderer", builtinPublicProvider, {
    ...builtinPublicModules,
    "@asterism-app/builtin-api/renderer": builtinRendererAPI,
  });
  signal.addEventListener("abort", releasePublic, { once: true });
  const rendererPlugins = await loadPluginRenderers(plugins, { available: [builtin.id], signal,
    progress: id => progress(startupMessages.plugins, id), async accept(plugin, id) {
      new ViewRegistry([...accepted, ...plugin.modules ?? []]);
      await preparePlugin(plugin, events, signal, undefined, close => cleanup.push(close), calls);
      accepted.push(...plugin.modules ?? []);
      if (plugin.settings) pages.set(id, plugin.settings);
    } });
  const moduleViews = new ViewRegistry(accepted);
  const builtinRendererServices = { preferences: pluginPreferences, async openLocalFile(path: string) {
    const error = await window.host.openLocalFile(path);
    if (error) throw new Error(error);
  } };
  signal.throwIfAborted();
  root.render(
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
                          <StartupNotification />
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
}
