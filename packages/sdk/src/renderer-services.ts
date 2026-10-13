import { createContext, useContext } from "react";
import type { Json } from "./json.ts";
import type { DataContract } from "./presentation.ts";
import type { ConfigContract } from "./config.ts";
import type { ModelLiveBlock } from "./models.ts";
import type { ToolRenderProps, ToolView } from "./renderer-tools.ts";
import type { EventSubscriber } from "./events.ts";

export interface RendererCatalogs { get<T extends Json>(contract: DataContract<T>): T | null; error: UiText | null }
export interface RendererTools {
  resolve(props: ToolRenderProps): ToolView & { props: ToolRenderProps };
  preparation(name: string): string;
}
export interface RendererModels { readonly blocks: readonly ModelLiveBlock[] }
export interface RendererNavigation { home(): void }
const Catalogs = createContext<RendererCatalogs | null>(null);
const Tools = createContext<RendererTools | null>(null);
const Models = createContext<RendererModels | null>(null);
const Navigation = createContext<RendererNavigation | null>(null);
const Events = createContext<EventSubscriber | null>(null);
export const RendererEventsProvider = Events.Provider;
/** 全局具型订阅；组件应在 effect 清理时关闭自己建立的订阅。 */
export function useRendererEvents(): EventSubscriber { return required(useContext(Events), "events"); }
export const RendererCatalogsProvider = Catalogs.Provider;
export const RendererToolsProvider = Tools.Provider;
export const RendererModelsProvider = Models.Provider;
export const RendererNavigationProvider = Navigation.Provider;
function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`Renderer ${name} must be provided by the host.`);
  return value;
}
export function useRendererCatalogs(): RendererCatalogs { return required(useContext(Catalogs), "catalogs"); }
export function useRendererTools(): RendererTools { return required(useContext(Tools), "tools"); }
export function useRendererModels(): RendererModels { return required(useContext(Models), "models"); }
export function useRendererNavigation(): RendererNavigation { return required(useContext(Navigation), "navigation"); }
import type { UiText } from "./i18n.ts";

/** 渲染层读取插件配置：宿主按契约解码，设置页保存后随变更通知更新；只能读取本插件的配置。 */
export interface RendererConfigs { get<T extends Json>(contract: ConfigContract<T>): { value: T; status: "saved" | "defaults" | "invalid" } }
const Configs = createContext<RendererConfigs | null>(null);
export const RendererConfigsProvider = Configs.Provider;
export function useRendererConfig<T extends Json>(contract: ConfigContract<T>): T {
  return required(useContext(Configs), "configs").get(contract).value;
}
