import { createContext, useContext } from "react";
import type { Json } from "./json.ts";
import type { DataContract } from "./presentation.ts";
import type { ConfigContract } from "./config.ts";
import type { ModelLiveBlock } from "./models.ts";
import type { ToolRenderProps, ToolView } from "./renderer-tools.ts";
import type { EventSubscriber } from "./events.ts";
import type { ResourceDescription } from "./renderer.ts";
import type { UiText } from "./i18n.ts";

/** 静态资源类型展示目录；查询描述不授予资源实例访问权限。 */
export interface RendererResources {
  list(): readonly ResourceDescription[];
  get(kind: string): ResourceDescription;
}
export interface RendererCatalogs { get<T extends Json>(contract: DataContract<T>): T | null; error: UiText | null }
export interface RendererTools {
  resolve(props: ToolRenderProps): ToolView & { props: ToolRenderProps };
  preparation(name: string): string;
}
export interface RendererModels { readonly blocks: readonly ModelLiveBlock[] }
export interface RendererNavigation { home(): void }
const Resources = createContext<RendererResources | null>(null);
const Catalogs = createContext<RendererCatalogs | null>(null);
const Tools = createContext<RendererTools | null>(null);
const Models = createContext<RendererModels | null>(null);
const Navigation = createContext<RendererNavigation | null>(null);
const Events = createContext<EventSubscriber | null>(null);
export const RendererEventsProvider = Events.Provider;
/** 全局具型订阅；组件应在 effect 清理时关闭自己建立的订阅。 */
export function useRendererEvents(): EventSubscriber { return required(useContext(Events), "events"); }
export const RendererResourcesProvider = Resources.Provider;
export const RendererCatalogsProvider = Catalogs.Provider;
export const RendererToolsProvider = Tools.Provider;
export const RendererModelsProvider = Models.Provider;
export const RendererNavigationProvider = Navigation.Provider;
function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`Renderer ${name} must be provided by the host.`);
  return value;
}
export function useRendererResources(): RendererResources { return required(useContext(Resources), "resources"); }
export function useRendererCatalogs(): RendererCatalogs { return required(useContext(Catalogs), "catalogs"); }
export function useRendererTools(): RendererTools { return required(useContext(Tools), "tools"); }
export function useRendererModels(): RendererModels { return required(useContext(Models), "models"); }
export function useRendererNavigation(): RendererNavigation { return required(useContext(Navigation), "navigation"); }

/** 渲染层读取插件配置：宿主按契约解码，设置页保存后随变更通知更新；只能读取本插件的配置。 */
export interface RendererConfiguration<T extends Json> {
  value: T;
  status: "saved" | "defaults" | "invalid";
  ready: boolean;
  error: UiText | null;
}
export interface RendererConfigs {
  get<T extends Json>(contract: ConfigContract<T>): RendererConfiguration<T>;
  save<T extends Json>(contract: ConfigContract<T>, value: NoInfer<T>): Promise<void>;
  reset(contract: ConfigContract): Promise<void>;
  refresh(): Promise<void>;
}
const Configs = createContext<RendererConfigs | null>(null);
export const RendererConfigsProvider = Configs.Provider;
export function useRendererConfig<T extends Json>(contract: ConfigContract<T>): T {
  return required(useContext(Configs), "configs").get(contract).value;
}
/** 自定义设置页使用托管配置；写入在后台校验，成功后同步发布新快照。 */
export function useRendererConfiguration<T extends Json>(contract: ConfigContract<T>) {
  const configs = required(useContext(Configs), "configs");
  return { ...configs.get(contract), save: (value: T) => configs.save(contract, value), reset: () => configs.reset(contract), refresh: configs.refresh };
}

export interface RendererSettingsNavigation { open(pluginId: string, location?: string): void }
const SettingsNavigation = createContext<RendererSettingsNavigation | null>(null);
export const RendererSettingsNavigationProvider = SettingsNavigation.Provider;
/** 打开插件设置，无需绑定当前资源或会话。 */
export function useRendererSettings(): RendererSettingsNavigation { return required(useContext(SettingsNavigation), "settings navigation"); }
