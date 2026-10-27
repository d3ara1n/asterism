import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  RendererCallsProvider, RendererIslandPanelProvider, RendererIslandProvider, RendererPreferencesProvider, useRendererCalls,
  type RendererIsland, type RendererIslandSpec,
} from "@asterism-app/sdk/renderer";
import type { PluginCalls } from "@asterism-app/sdk/contracts";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { pluginsMessages as messages } from "../../messages/plugins";
import { useI18n } from "../../shared/i18n";
import { IslandPanel, panelIslandWidth } from "../../shared/weave/IslandPanel";
import { useIsland } from "../../shared/weave/Screen";
import { pluginPreferences } from "../creation/preferences";

/** Plugin UI errors affect only their own region; the host retains management access. */
export class SettingsBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Plugin settings page failed.", error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Communication initiated within the region is cancelled on unmount; independent backend business services remain owned by the plugin lifecycle. */
export function PluginCallScope({ children }: { children: ReactNode }) {
  const parent = useRendererCalls();
  const pending = useRef(new Set<AbortController>());
  const calls = useMemo<PluginCalls>(() => ({ invoke: (contract, input, options) => {
    const controller = new AbortController();
    const active = pending.current;
    active.add(controller);
    return parent.invoke(contract, input, { ...options,
      signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal,
    }).finally(() => active.delete(controller));
  } }), [parent]);
  useEffect(() => {
    const active = pending.current;
    return () => { for (const controller of active) controller.abort(); active.clear(); };
  }, []);
  return <RendererCallsProvider value={calls}>{children}</RendererCallsProvider>;
}

/**
 * Adapt the containing host island into a plugin island: identities are isolated by plugin, and the host standardizes width and shell.
 * page is the island containing the settings page: when the page unmounts, close the islands it opened as well (content is invalid, so skip guards).
 */
export function PluginIslandProvider({ pluginId, page = false, children }: { pluginId: string; page?: boolean; children: ReactNode }) {
  const island = useIsland();
  const prefix = `plugin-island:${pluginId}:`;
  const adapter = useMemo<RendererIsland>(() => ({
    get child() { const child = island.child; return child?.startsWith(prefix) ? child.slice(prefix.length) : undefined; },
    open: spec => island.open({ id: prefix + spec.key, label: spec.label, width: panelIslandWidth, origin: spec.origin,
      render: () => <PluginIslandContent pluginId={pluginId} spec={spec} /> }),
    close: options => island.close(options),
    closeChild: options => island.closeChild(options),
    guard: guard => island.guard(guard),
  }), [island, pluginId, prefix]);
  useEffect(() => {
    if (!page) return;
    return () => { if (island.child?.startsWith(prefix)) void island.closeChild({ force: true }); };
  }, [page, island, prefix]);
  return <RendererIslandProvider value={adapter}>
    <RendererIslandPanelProvider value={IslandPanel}>{children}</RendererIslandPanelProvider>
  </RendererIslandProvider>;
}

/** Call the plugin's render during rendering so its errors reach the boundary. */
function Render({ render }: { render: () => ReactNode }) { return render(); }

/** Plugin island content renders within the host screen, outside the settings page context, so provide plugin preferences, communication scope, and an error boundary again. */
function PluginIslandContent({ pluginId, spec }: { pluginId: string; spec: RendererIslandSpec }) {
  const i18n = useI18n();
  return <RendererPreferencesProvider value={pluginPreferences(pluginId)}>
    <PluginCallScope>
      <PluginIslandProvider pluginId={pluginId}>
        <SettingsBoundary fallback={<IslandPanel title={i18n.text(spec.label)}>
          <Alert variant="destructive"><AlertDescription>{i18n.text(messages.pageFailed)}</AlertDescription></Alert>
        </IslandPanel>}>
          <Render render={spec.render} />
        </SettingsBoundary>
      </PluginIslandProvider>
    </PluginCallScope>
  </RendererPreferencesProvider>;
}
