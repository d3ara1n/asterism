/** SDK renderer 入口：卡片、工具视图与绑定对象的前端能力；React 由宿主共享。 */
import { createContext, createElement, useContext, type ComponentType, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";
export * from "./renderer-i18n.ts";
import type { ActionContract, CreationContract } from "./commands.ts";
import type { Json } from "./json.ts";
import { reference, type ContractReference, type DataContract } from "./presentation.ts";
import type { ResourceRef, SessionSnapshot } from "./workspace.ts";
export * from "./renderer-services.ts";
export * from "./renderer-calls.ts";
export * from "./renderer-creation.ts";
export * from "./renderer-tools.ts";
export * from "./renderer-records.ts";
export * from "./renderer-card.ts";
import type { CardPanelDefinition, CardPanelView } from "./renderer-card.ts";
import type { RecordRenderer } from "./renderer-records.ts";
export type * from "./renderer-content.ts";
import type { RendererContentInput, RendererInputOptions } from "./renderer-content.ts";
import type { ContentReader } from "./content-runtime.ts";
export type { ContentReader } from "./content-runtime.ts";
import type { CreationEntry } from "./renderer-creation.ts";
import type { ToolRenderer } from "./renderer-tools.ts";
import type { EventSubscriber } from "./events.ts";
import type { PluginCalls } from "./calls.ts";

export type RendererReceipt = { ok: true } | { ok: false; error: { code: string; message: string; display?: UiText } };
/**
 * 按对象保留的前端状态（如输入草稿）：跨卡片重挂载、聚焦容器切换与会话视图释放保持；
 * 对象离开当前会话投影（移除或游标跳转）或显式丢弃时调用 release，应用重启后不恢复。
 */
export interface RendererRetained {
  /** 取得 key 对应的值，首次调用时用 create 创建；同一对象同一 key 返回同一实例。key 以插件 ID 为前缀避免与其他贡献者冲突。 */
  get<T>(key: string, create: () => T, release?: (value: T) => void | Promise<void>): T;
  /** 立即结束保留并调用 release；不存在时无效。 */
  discard(key: string): void;
}
/** 绑定卡片对象的前端能力；宿主负责订阅、命令门禁和当前视图的一致性。 */
export interface RendererObjectContext {
  readonly ref: ResourceRef;
  readonly content: ContentReader;
  input<I, O extends Json>(contract: ActionContract<I, O> | CreationContract<I, Json, O>): RendererContentInput;
  readonly view: {
    /** 当前对象视图可操作；普通后台刷新与其他对象的局部提交不改变此值。 */
    ready: boolean;
    /** 视图读取异常；对象动作和创建失败通过各自调用回执返回。 */
    error: UiText | null; missing: boolean;
  };
  readonly session: {
    snapshot(): SessionSnapshot | null;
    subscribe(listener: () => void): () => void;
    create<I, O extends Json>(contract: CreationContract<I, Json, O>, input: NoInfer<I> & Json, position: { x: number; y: number }, options?: RendererInputOptions): Promise<RendererReceipt>;
    refresh(): Promise<void>;
  };
  invoke<I, O extends Json>(contract: ActionContract<I, O>, input: NoInfer<I> & Json, options?: RendererInputOptions): Promise<RendererReceipt>;
  /** channel 使用插件内短名，与 object.streams.publish 相同；宿主自动补全插件命名空间。 */
  onStream(channel: string, listener: (data: Uint8Array) => void): () => void;
  /** 对象级保留状态，生命周期由宿主统一管理。 */
  readonly retained: RendererRetained;
}
const ObjectContext = createContext<RendererObjectContext | null>(null);
export function useRendererObject(): RendererObjectContext {
  const object = useContext(ObjectContext);
  if (!object) throw new Error("The renderer must be bound to an object.");
  return object;
}

/** 类型级静态识别信息，不解析卡片数据，也不创建正文组件。 */
export interface ResourceDescription {
  kind: string;
  label: UiText;
  icon: ReactNode;
  /** 创建前可取用的默认卡片尺寸，与卡片 renderer 共用声明。 */
  card?: CardAppearance;
  /** 本资源可作为有向链接终点，与后台 links.receive 一致。 */
  receivesLinks?: boolean;
}
export interface CardAppearance {
  /** 画布单位下的默认尺寸；用户覆盖由工作台保存。 */
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
}
export interface CardView extends CardAppearance {
  body: ReactNode;
  actions?: ReactNode;
  panels?: readonly CardPanelView[];
}
export interface CardRenderer {
  contract: ContractReference;
  resolve(data: Json, context?: RendererObjectContext): CardView | null;
}
export interface RendererModule {
  resources: ResourceDescription[];
  cards: CardRenderer[];
  tools: ToolRenderer[];
  /** 历史记录视图：按记录契约声明摘要、图标与可选行内容。 */
  records?: RecordRenderer[];
  /** 创建入口：菜单与拖放由宿主统一仲裁，最终都走所绑定的创建契约。 */
  creations?: CreationEntry[];
  /** 启动准备：宿主在首屏前并行调用，模块自行初始化内部资源；超时或失败只记录，不阻止启动。 */
  prepare?(context: RendererPrepareContext): Promise<void>;
}
export interface PluginSettingsPage {
  /** 可直接定位的页面内部位置；空位置表示根页面。 */
  locations?: readonly string[];
  Body: ComponentType<{ location?: string }>;
}
/** 前端插件拥有设置页和共享服务生命周期，功能视图由模块组合。 */
export interface RendererPlugin {
  modules?: readonly RendererModule[];
  settings?: PluginSettingsPage;
  prepare?(context: RendererPrepareContext): Promise<void>;
  closing?(): void | Promise<void>;
}
export function defineRendererPlugin(plugin: RendererPlugin): RendererPlugin { return plugin; }
export interface RendererPrepareContext {
  /** 前端模块级服务使用的具型调用；取消随准备作用域传播。 */
  readonly calls: PluginCalls;
  /** 与模块生命周期绑定的全局订阅，失败、超时和应用关闭时清理。 */
  readonly events: EventSubscriber;
  /** 宿主放弃等待（超时或关闭）时触发；模块应尽快停止。 */
  readonly signal: AbortSignal;
}

/** 类型擦除只发生在注册边界；组件接收到的是已通过契约校验的数据。 */
export function cardRenderer<T extends Json>(
  contract: DataContract<T>,
  definition: CardAppearance & {
    Body: ComponentType<{ data: T }>;
    Actions?: ComponentType<{ data: T }>;
    panels?: readonly CardPanelDefinition<T>[];
  },
): CardRenderer {
  const { Body, Actions, panels, ...appearance } = definition;
  const ids = new Set<string>();
  for (const panel of panels ?? []) {
    if (!panel.id.trim() || panel.id !== panel.id.trim()) throw new Error("Card panel IDs must be non-empty and trimmed.");
    if (ids.has(panel.id)) throw new Error(`Duplicate card panel ID: ${panel.id}`);
    ids.add(panel.id);
  }
  return { contract: reference(contract), resolve(raw, context) {
    const parsed = contract.schema.safeParse(raw);
    if (!parsed.success) return null;
    const bind = (node: ReactNode) => context ? createElement(ObjectContext.Provider, { value: context }, node) : node;
    return { ...appearance, body: bind(createElement(Body, { data: parsed.data })),
      actions: Actions ? bind(createElement(Actions, { data: parsed.data })) : undefined,
      panels: panels?.map(({ Body: PanelBody, ...panel }) => ({
        ...panel, body: bind(createElement(PanelBody, { data: parsed.data })),
      })) };
  } };
}
