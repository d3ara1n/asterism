import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  RendererCallsProvider, RendererIslandPanelProvider, RendererIslandProvider, RendererPreferencesProvider, RendererResourceNavigationProvider, useRendererCalls,
  type RendererIsland, type RendererIslandSpec, type RendererCalls, type RendererResourceNavigation,
} from "@asterism-app/sdk/renderer";
import { pluginOf } from "@asterism-app/sdk/contracts";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { objectsMessages } from "../../messages/objects";
import { pluginsMessages as messages } from "../../messages/plugins";
import { useModuleViews } from "../../modules/views";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { operationSucceeded, toast } from "../../shared/toast";
import { IslandPanel, panelIslandWidth } from "../../shared/weave/IslandPanel";
import { useIsland, type IslandApi, type IslandSpec } from "../../shared/weave/Screen";
import type { IslandView } from "../../../shared/workbench";
import type { ViewRegistry } from "../../modules/registry";
import { pluginPreferences } from "../creation/preferences";

/** Host spec for a plugin island; restore tags it as rebuildable from that view. */
function pluginIslandSpec(pluginId: string, spec: RendererIslandSpec, restore?: IslandView): IslandSpec {
  return { key: `plugin-island:${pluginId}:${spec.key}`, label: spec.label,
    width: spec.size === "content" ? { min: 560, grow: 2 } : panelIslandWidth, origin: spec.origin, restore,
    render: () => <PluginIslandContent pluginId={pluginId} spec={spec} /> };
}

/** restore tags the first island opened through this adapter: a resource opener shows its location there. */
function pluginIsland(island: IslandApi, pluginId: string, restore?: IslandView, owned?: Set<string>): RendererIsland {
  const prefix = `plugin-island:${pluginId}:`;
  let tag = restore;
  return {
    has: key => island.has(prefix + key),
    bindKey: key => island.key?.startsWith(prefix) ? island.bindKey(prefix + key) : false,
    open: async spec => {
      const next = pluginIslandSpec(pluginId, spec, tag); tag = undefined;
      const opened = await island.open(next);
      if (opened?.opened) owned?.add(opened.id);
      return opened !== null;
    },
    close: options => island.close(options),
    closeOwned: options => island.closeOwned(options),
    guard: guard => island.guard(guard),
    onCancel: action => island.onCancel(action),
  };
}

/**
 * Rebuild a restored resource island: run the resource's opener against a capturing island and take the island it opens.
 * Null when the resource is absent, cannot open locations, or opens nothing.
 */
export async function resolveResourceIsland(registry: ViewRegistry, calls: RendererCalls,
  object: { id: string; kind: string } | undefined, sessionId: string, view: Extract<IslandView, { kind: "resource" }>): Promise<IslandSpec | null> {
  const descriptor = object && registry.resource(object.kind);
  if (!object || !descriptor?.open) return null;
  const pluginId = pluginOf(object.kind)!;
  let captured: IslandSpec | null = null;
  const capture: RendererIsland = {
    has: () => false, bindKey: () => false,
    open: async spec => { captured ??= pluginIslandSpec(pluginId, spec, view); return true; },
    close: async () => false, closeOwned: async () => true, guard: () => () => {}, onCancel: () => () => {},
  };
  try {
    await descriptor.open(view.location, { resource: { sessionId, id: object.id, kind: object.kind }, calls, island: capture });
  } catch (error) {
    console.error("Restored resource island could not be opened.", error);
    return null;
  }
  return captured;
}

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
  const calls = useMemo<RendererCalls>(() => ({ input: contract => parent.input(contract), invoke: (contract, input, options) => {
    const controller = new AbortController();
    const active = pending.current;
    active.add(controller);
    return parent.invoke(contract, input, { ...options, content: options.content,
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
 * Islands opened here belong to the containing island. page closes only the islands newly opened by this region when it unmounts, skipping guards because its content is invalid.
 */
export function PluginIslandProvider({ pluginId, page = false, children }: {
  pluginId: string; page?: boolean; children: ReactNode;
}) {
  const island = useIsland();
  const registry = useModuleViews();
  const calls = useRendererCalls();
  const i18n = useI18n();
  const opened = useRef(new Set<string>());
  const owned = page ? opened.current : undefined;
  const adapter = useMemo(() => pluginIsland(island, pluginId, undefined, owned), [island, pluginId, owned]);
  const navigation = useMemo<RendererResourceNavigation>(() => ({
    async open(target, location, options) {
      try {
        const result = await runtime.session.execute({ type: "read", sessionId: target.sessionId });
        if (!result.ok) {
          if (result.error.code === "not_found") toast.error(i18n.text(objectsMessages.resourceMissing));
          else operationSucceeded(result);
          return false;
        }
        if (result.reply.kind !== "view") throw new Error("Resource navigation requires a session view.");
        const object = result.reply.data.workbench.objects.find(object => object.id === target.id && !object.retiring);
        if (!object) { toast.error(i18n.text(objectsMessages.resourceMissing)); return false; }
        const descriptor = registry.resource(object.kind);
        if (!descriptor.open) { toast.error(i18n.text(objectsMessages.resourceOpenUnsupported)); return false; }
        const resource = { sessionId: target.sessionId, id: object.id, kind: object.kind };
        return await descriptor.open(location, { resource, calls, origin: options?.origin,
          island: pluginIsland(island, pluginOf(object.kind)!, { kind: "resource", resourceId: object.id, location }, owned) });
      } catch (error) {
        console.error("Resource location could not be opened.", error);
        toast.error(i18n.text(failureDisplay(error, objectsMessages.resourceOpenFailed)));
        return false;
      }
    },
  }), [island, registry, calls, i18n, owned]);
  useEffect(() => {
    if (!owned) return;
    // Home and the workbench share a host island and overlap during page transitions.
    // A departing region must not close islands restored by the incoming page.
    return () => {
      for (const target of owned) void island.closeOwned({ force: true, target });
      owned.clear();
    };
  }, [owned, island]);
  return <RendererIslandProvider value={adapter}>
    <RendererResourceNavigationProvider value={navigation}>
      <RendererIslandPanelProvider value={IslandPanel}>{children}</RendererIslandPanelProvider>
    </RendererResourceNavigationProvider>
  </RendererIslandProvider>;
}

/** Call the plugin's render during rendering so its errors reach the boundary. */
function Render({ render }: { render: () => ReactNode }) { return render(); }

/**
 * One composition for every mounted plugin region (Home entry, settings page, island).
 * The boundary encloses the call scope, so a failed region also cancels the calls it started.
 */
export function PluginRegion({ pluginId, page = false, fallback, children }: { pluginId: string; page?: boolean; fallback: ReactNode; children: ReactNode }) {
  return <SettingsBoundary fallback={fallback}>
    <RendererPreferencesProvider value={pluginPreferences(pluginId)}>
      <PluginCallScope><PluginIslandProvider pluginId={pluginId} page={page}>{children}</PluginIslandProvider></PluginCallScope>
    </RendererPreferencesProvider>
  </SettingsBoundary>;
}

/** Plugin island content renders within the host screen, outside the page that opened it, so it forms its own region. */
function PluginIslandContent({ pluginId, spec }: { pluginId: string; spec: RendererIslandSpec }) {
  const i18n = useI18n();
  return <PluginRegion pluginId={pluginId} fallback={<IslandPanel title={i18n.text(spec.label)}>
    <Alert variant="destructive"><AlertDescription>{i18n.text(messages.pageFailed)}</AlertDescription></Alert>
  </IslandPanel>}><Render render={spec.render} /></PluginRegion>;
}
