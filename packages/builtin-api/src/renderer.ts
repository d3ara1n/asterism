import { createContext, createElement, useContext, type ComponentType, type ReactNode } from "react";
import { pluginOf, pluginNamespace, type UiText } from "@atelier/sdk/contracts";

/** 每个已展开的 Agent 卡片挂载一份；通过 SDK useRendererObject 取得关联对象。 */
export interface AgentUIContribution {
  readonly id: string;
  readonly Component: ComponentType;
}

/** 由内置实现和消费者共享的前端登记表；业务状态仍归贡献插件。 */
function createAgentUIRegistry() {
  let entries: readonly AgentUIContribution[] = [];
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => entries,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** 在 renderer.prepare 中登记；准备失败、超时或应用退出时随 signal 释放。 */
    register(contribution: AgentUIContribution, { signal }: { signal: AbortSignal }): () => void {
      signal.throwIfAborted();
      const plugin = pluginOf(contribution.id);
      if (!plugin) throw new Error(`Agent UI contribution needs a namespaced ID: ${contribution.id}`);
      pluginNamespace(plugin).name(contribution.id.slice(plugin.length + 1));
      if (entries.some(entry => entry.id === contribution.id))
        throw new Error(`Duplicate Agent UI contribution: ${contribution.id}`);
      const entry = Object.freeze({ ...contribution });
      const remove = () => {
        signal.removeEventListener("abort", remove);
        if (!entries.includes(entry)) return;
        entries = entries.filter(value => value !== entry);
        notify();
      };
      signal.addEventListener("abort", remove, { once: true });
      entries = [...entries, entry];
      notify();
      return remove;
    },
  };
}

export const agentUI = createAgentUIRegistry();

export type AgentOverlayPosition = "top" | "center" | "bottom";
export interface AgentOverlayProps {
  position: AgentOverlayPosition;
  /** 界面存在期间隐藏并禁用输入区；多个请求取或。 */
  hideComposer?: boolean;
  children: ReactNode;
}
export interface AgentModalProps {
  open: boolean;
  title: UiText;
  description?: UiText;
  /** 关闭只是界面意图；是否结束业务等待由插件处理。未提供时没有关闭入口。 */
  onOpenChange?(open: boolean): void;
  hideComposer?: boolean;
  children: ReactNode;
}

/** 内置 Agent 注入布局实现；公共包不依赖实现包或控件库。 */
export interface AgentUIRenderer {
  Overlay: ComponentType<AgentOverlayProps>;
  Modal: ComponentType<AgentModalProps>;
}
const Renderer = createContext<AgentUIRenderer | null>(null);
export const AgentUIRendererProvider = Renderer.Provider;
function useAgentUIRenderer(): AgentUIRenderer {
  const renderer = useContext(Renderer);
  if (!renderer) throw new Error("Agent UI must be rendered inside an Agent card.");
  return renderer;
}
export function AgentOverlay(props: AgentOverlayProps): ReactNode {
  return createElement(useAgentUIRenderer().Overlay, props);
}
export function AgentModal(props: AgentModalProps): ReactNode {
  return createElement(useAgentUIRenderer().Modal, props);
}
