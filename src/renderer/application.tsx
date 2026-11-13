import { StrictMode, useEffect } from "react";
import { rendererFiles } from "./files";
import { RendererEventsProvider, RendererCallsProvider, RendererApplicationProvider } from "@asterism-app/sdk/renderer";
import { EventClient } from "../shared/event-client";
import { CallClient } from "../shared/call-client";
import { HostI18nProvider, setLanguageCatalogs } from "./shared/i18n";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@asterism-app/ui/ui/tooltip";
import { Button } from "@asterism-app/ui/ui/button";
import { ModuleViewsProvider } from "./modules/views";
import { HostConfigsProvider } from "./modules/configs";
import { App } from "./app/App";

import type { Root } from "react-dom/client";

import { ApplicationController } from "./app/controller";

import { ViewRegistry } from "./modules/registry";
import { workbenchRecordViews } from "./features/workbench/records";
import { loadPluginRenderers } from "./modules/plugins";
import { pluginPreferences } from "./features/creation/preferences";
import { preparePlugin } from "./app/startup";
import { pluginName } from "../shared/plugin-name";
import { PluginSettingsProvider, settingsPageKey, type RegisteredSettingsPage, type RegisteredSessionEntry } from "./modules/settings";
import { PluginCommandsProvider, type RegisteredCommandGroup } from "./modules/commands";
import { getI18n, useI18n } from "./shared/i18n";
import { toast } from "./shared/toast";
import { startupMessages } from "../shared/error-display";
import type { UiText } from "@asterism-app/sdk/contracts";

import { runtime } from "./runtime";
import { contentInput, contentScopeId } from "./features/creation/content";

/** Present migration completion and plugin storage failures after the home page mounts. */
function StartupNotification() {
  const i18n = useI18n();
  useEffect(() => {
    void window.host.startup.initialized().then(({ migrationPointId, failures }) => {
      if (migrationPointId) {
        const toastId = `migration:${migrationPointId}`;
        const acknowledge = () => {
          void window.host.startup.acknowledgeMigration()
            .then(() => toast.dismiss(toastId))
            .catch(error => toast.error(String(error)));
        };
        toast.success(i18n.text(startupMessages.migratedTitle), {
          id: toastId,
          description: <div className="flex flex-col gap-3">
            <p>{i18n.text(startupMessages.migratedBody)}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                void window.host.startup.openRecoveryPoint(migrationPointId)
                  .then(error => { if (error) toast.error(error); })
                  .catch(error => toast.error(String(error)));
              }}>{i18n.text(startupMessages.migratedOpenBackup)}</Button>
              <Button size="sm" onClick={acknowledge}>{i18n.text(startupMessages.migratedConfirm)}</Button>
            </div>
          </div>,
          duration: Infinity,
          onDismiss: acknowledge,
        });
      }
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
  const calls = new CallClient(runtime.calls, {
    input: contract => contentInput({ kind: "call", contractId: contract.id }),
    scope: (input, contract) => contentScopeId(input, { kind: "call", contractId: contract.id }),
  });
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
  const names = new Map(initial.snapshot.plugins.flatMap(p => p.id ? [[p.id, pluginName(p)] as const] : []));
  const plugins = initial.snapshot.plugins.flatMap(p => p.status === "loaded" && p.id ? [{ id: p.id, renderer: p.renderer, stylesheet: p.stylesheet, dependencies: p.dependencies }] : []);
  const accepted = [workbenchRecordViews];
  const pages = new Map<string, RegisteredSettingsPage>();
  const sessionEntries: RegisteredSessionEntry[] = [];
  const commandGroups: RegisteredCommandGroup[] = [];
  const cleanup: (() => Promise<void>)[] = [];
  signal.addEventListener("abort", () => { void (async () => {
    for (const close of cleanup.reverse()) {
      try { await close(); } catch (error) { console.error("Renderer plugin cleanup failed.", error); }
    }
  })(); }, { once: true });
  const rendererPlugins = await loadPluginRenderers(plugins, { signal,
    progress: id => progress(startupMessages.plugins, id), async accept(plugin, id) {
      new ViewRegistry([...accepted, ...plugin.modules ?? []]);
      const prepared = await preparePlugin(plugin, events, signal, undefined, close => cleanup.push(close), calls);
      accepted.push(...plugin.modules ?? []);
      const name = names.get(id) ?? id;
      for (const page of plugin.settings ?? []) pages.set(settingsPageKey(id, page.id), { ...page, pluginId: id, pluginName: name });
      for (const entry of plugin.sessionEntries ?? []) sessionEntries.push({ ...entry, pluginId: id, pluginName: name });
      for (const group of plugin.commands ?? []) commandGroups.push({ ...group, pluginId: id, pluginName: name });
      return prepared.diagnostics;
    } });
  const moduleViews = new ViewRegistry(accepted);
  const applicationServices = { platform: window.host.platform, preferences: pluginPreferences, files: rendererFiles,
    pickDirectory: (initialPath?: string) => window.host.pickDirectory(initialPath), async openLocalFile(path: string) {
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
                      <RendererApplicationProvider value={applicationServices}>
                        <PluginSettingsProvider value={{ pages, sessionEntries, renderers: rendererPlugins.outcomes }}>
                          <PluginCommandsProvider groups={commandGroups}><App controller={controller} /></PluginCommandsProvider>
                          <StartupNotification />
                        </PluginSettingsProvider>
                      </RendererApplicationProvider>
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
