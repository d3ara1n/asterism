import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  RendererCallsProvider, RendererIslandPanelProvider, RendererIslandProvider, RendererPreferencesProvider, useRendererCalls,
  type RendererIsland, type RendererIslandSpec,
} from "@asterism/sdk/renderer";
import type { PluginCalls } from "@asterism/sdk/contracts";
import { Alert, AlertDescription } from "@asterism/ui/ui/alert";
import { pluginsMessages as messages } from "../../messages/plugins";
import { useI18n } from "../../shared/i18n";
import { IslandPanel, panelIslandWidth } from "../../shared/weave/IslandPanel";
import { useIsland } from "../../shared/weave/Screen";
import { pluginPreferences } from "../creation/preferences";

/** 插件界面异常只影响所在区域，宿主保留管理入口。 */
export class SettingsBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Plugin settings page failed.", error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** 区域内发起的通信随卸载取消；后台独立业务服务仍由插件生命周期拥有。 */
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
 * 把所在宿主浮岛适配为插件浮岛：身份按插件隔离，宽度与外框由宿主统一。
 * page 为设置页所在浮岛：页面卸载时一并关闭它打开的浮岛（内容已失效，跳过守卫）。
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

/** 在渲染期调用插件的 render，使其异常落入边界。 */
function Render({ render }: { render: () => ReactNode }) { return render(); }

/** 插件浮岛内容在宿主屏内渲染，脱离设置页的上下文，因此重新提供插件偏好、通信作用域与异常边界。 */
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
