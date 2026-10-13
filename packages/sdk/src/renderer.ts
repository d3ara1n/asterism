/** SDK renderer 入口：卡片、工具视图与绑定对象的前端能力；React 由宿主共享。 */
import { createContext, createElement, useContext, type ComponentType, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";
export * from "./renderer-i18n.ts";
import type { ActionContract, CreationContract } from "./commands.ts";
import type { Json } from "./json.ts";
import { reference, type ContractReference, type DataContract } from "./presentation.ts";
import type { ResourceRef, SessionSnapshot } from "./workspace.ts";
export * from "./renderer-services.ts";
export * from "./renderer-creation.ts";
export * from "./renderer-tools.ts";
export type * from "./renderer-content.ts";
import type { RendererContentInput, RendererInputOptions } from "./renderer-content.ts";
import type { ContentReader } from "./content-runtime.ts";
export type { ContentReader } from "./content-runtime.ts";
import type { CreationEntry } from "./renderer-creation.ts";
import type { ToolRenderer } from "./renderer-tools.ts";

export type RendererReceipt = { ok: true } | { ok: false; error: { code: string; message: string; display?: UiText } };
/** 绑定卡片对象的前端能力；宿主负责订阅、命令门禁和当前视图的一致性。 */
export interface RendererObjectContext {
  readonly ref: ResourceRef;
  readonly content: ContentReader;
  input<I, O extends Json>(contract: ActionContract<I, O> | CreationContract<I, Json, O>): RendererContentInput;
  readonly view: {
    ready: boolean; busy: boolean; historical: boolean; status: "loading" | "ready" | "error";
    error: UiText | null; missing: boolean;
  };
  readonly session: {
    snapshot(): SessionSnapshot | null;
    subscribe(listener: () => void): () => void;
    create<I, O extends Json>(contract: CreationContract<I, Json, O>, input: NoInfer<I> & Json, position: { x: number; y: number }, options?: RendererInputOptions): Promise<RendererReceipt>;
    refresh(): Promise<void>;
    followLive(): void;
  };
  invoke<I, O extends Json>(contract: ActionContract<I, O>, input: NoInfer<I> & Json, options?: RendererInputOptions): Promise<RendererReceipt>;
  onStream(channel: string, listener: (data: Uint8Array) => void): () => void;
  readonly activity: { running: boolean };
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
}
export interface CardRenderer {
  contract: ContractReference;
  resolve(data: Json, context?: RendererObjectContext): CardView | null;
}
export interface RendererModule {
  resources: ResourceDescription[];
  cards: CardRenderer[];
  tools: ToolRenderer[];
  /** 创建入口：菜单与拖放由宿主统一仲裁，最终都走所绑定的创建契约。 */
  creations?: CreationEntry[];
  /** 启动准备：宿主在首屏前并行调用，模块自行初始化内部资源；超时或失败只记录，不阻止启动。 */
  prepare?(context: RendererPrepareContext): Promise<void>;
}
export interface RendererPrepareContext {
  /** 宿主放弃等待（超时或关闭）时触发；模块应尽快停止。 */
  readonly signal: AbortSignal;
}

/** 类型擦除只发生在注册边界；组件接收到的是已通过契约校验的数据。 */
export function cardRenderer<T extends Json>(
  contract: DataContract<T>,
  definition: CardAppearance & { Body: ComponentType<{ data: T }>; Actions?: ComponentType<{ data: T }> },
): CardRenderer {
  const { Body, Actions, ...appearance } = definition;
  return { contract: reference(contract), resolve(raw, context) {
    const parsed = contract.schema.safeParse(raw);
    if (!parsed.success) return null;
    const bind = (node: ReactNode) => context ? createElement(ObjectContext.Provider, { value: context }, node) : node;
    return { ...appearance, body: bind(createElement(Body, { data: parsed.data })),
      actions: Actions ? bind(createElement(Actions, { data: parsed.data })) : undefined };
  } };
}
