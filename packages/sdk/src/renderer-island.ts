import { createContext, createElement, useContext, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";

/**
 * 浮岛：宿主屏内的一列独立表面，在所在浮岛右侧打开并替换原有的更深浮岛。
 * 宽度、位置、动效与焦点由宿主统一管理；插件只提供身份、无障碍名称与内容。
 */
export interface RendererIslandSpec {
  /** 插件内唯一的浮岛身份；宿主按插件身份隔离。同一身份再次打开时替换内容。 */
  key: string;
  /** 浮岛无障碍名称与溢出导航提示。 */
  label: UiText;
  /** 打开它的元素：用于展开动画，关闭后焦点回到该元素。 */
  origin?: HTMLElement | null;
  render: () => ReactNode;
}
/** 关闭守卫：返回 false（或解析为 false）时中止关闭；可异步等待用户确认。 */
export type RendererCloseGuard = () => boolean | Promise<boolean>;
export interface RendererIsland {
  /** 本浮岛右侧由本插件打开的更深浮岛身份。 */
  readonly child: string | undefined;
  /** 在本浮岛右侧打开更深的浮岛；被替换的浮岛可经守卫拒绝。解析为是否已打开。 */
  open(spec: RendererIslandSpec): Promise<boolean>;
  /** 关闭本浮岛及更深浮岛；插件设置页所在的浮岛由宿主管理，调用无效。force 跳过守卫。 */
  close(options?: { force?: boolean }): Promise<boolean>;
  /** 关闭本浮岛右侧的更深浮岛。 */
  closeChild(options?: { force?: boolean }): Promise<boolean>;
  /** 注册本浮岛的关闭守卫，返回注销函数。一般经 useRendererCloseGuard 使用。 */
  guard(guard: RendererCloseGuard): () => void;
}
/**
 * 面板浮岛外框：标题栏固定，内容区单独滚动；主操作与关闭位于标题栏右侧。
 * dirty 为 true 时关闭本浮岛（含上级关闭或替换）先由宿主确认放弃修改。
 */
export interface RendererIslandPanelProps {
  title: string;
  description?: string;
  /** 标题栏主操作，如保存。 */
  action?: ReactNode;
  /** 标题栏下方固定的工具区，如搜索。 */
  toolbar?: ReactNode;
  dirty?: boolean;
  children: ReactNode;
}

const Island = createContext<RendererIsland | null>(null);
const Panel = createContext<ComponentType<RendererIslandPanelProps> | null>(null);
export const RendererIslandProvider = Island.Provider;
export const RendererIslandPanelProvider = Panel.Provider;
function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`Renderer ${name} must be provided by the host.`);
  return value;
}
/** 所在浮岛；插件设置页与其打开的浮岛内可用。 */
export function useRendererIsland(): RendererIsland { return required(useContext(Island), "island"); }
/** 为所在浮岛注册关闭守卫；guard 为 null 时放行，守卫始终取最新的回调。 */
export function useRendererCloseGuard(guard: RendererCloseGuard | null) {
  const island = useRendererIsland();
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => island.guard(() => latest.current ? latest.current() : true), [island]);
}
/** 宿主绘制的面板外框，在插件打开的浮岛内使用。 */
export function IslandPanel(props: RendererIslandPanelProps) {
  return createElement(required(useContext(Panel), "island panel"), props);
}
