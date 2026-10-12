import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { z } from "zod";
import type { CreationContract } from "./commands.ts";
import type { Json } from "./json.ts";

/**
 * 拖入内容的宿主快照：放下时由宿主从 DataTransfer 读出，事件结束后仍然有效。
 * 文件路径由宿主经桌面桥解析，插件不能伪造。
 */
export type DropItem =
  | { readonly kind: "file"; readonly path: string; readonly name: string; readonly mime: string; readonly directory: boolean }
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "text"; readonly text: string };

/**
 * 声明式受理条件：宿主在拖拽悬停时同步匹配，不调用插件函数。
 * 扩展名含前导点、小写；MIME 支持 `image/*` 形式的通配。
 */
export interface DropAccepts {
  readonly files?: { readonly directories?: boolean; readonly extensions?: readonly string[]; readonly mime?: readonly string[] };
  readonly urls?: { readonly schemes?: readonly string[] };
  readonly text?: boolean;
}

/** 入口被触发的来源；菜单没有载荷。 */
export type CreationSource = { readonly kind: "menu" } | { readonly kind: "drop"; readonly item: DropItem };

/** 插件自有偏好：宿主按插件隔离、持久化于界面状态；读取时按调用方 schema 校验。 */
export interface RendererPreferences {
  get<T extends Json>(key: string, schema: z.ZodType<T>): T | null;
  set(key: string, value: Json | null): void;
}

/**
 * 输入阶段组件：可以渲染任意界面（表单、预览等），只能交回输入或取消。
 * resolve 返回宿主创建是否成功；失败时组件保持打开，错误由宿主外壳展示。
 */
export interface CreationInputProps<I = Json> {
  readonly source: CreationSource;
  readonly initialInput?: I;
  readonly busy: boolean;
  resolve(input: I): Promise<boolean>;
  cancel(): void;
}

export interface CreationEntry<I = Json> {
  /** 全局稳定身份，使用声明插件的命名空间；路由记忆以它为值。 */
  readonly id: string;
  readonly contract: CreationContract<I, Json, Json>;
  readonly label: UiText;
  readonly description?: UiText;
  readonly icon?: ReactNode;
  /** 菜单分组；未声明归入资源。 */
  readonly group?: "agents" | "resources";
  readonly triggers: {
    readonly menu?: { readonly initialInput?: I };
    readonly drop?: { readonly accepts: DropAccepts; toInput(item: DropItem): I | null };
  };
  /** 缺省时由触发来源直接产出输入；菜单来源此时必须提供 initialInput。 */
  readonly InputView?: ComponentType<CreationInputProps<I>>;
}

/** 类型擦除只发生在注册边界；调用与组件的输入类型由创建契约推导。 */
export function creationEntry<I, O extends Json>(contract: CreationContract<I, Json, O>,
  definition: Omit<CreationEntry<NoInfer<I> & Json>, "contract">): CreationEntry {
  if (!definition.triggers.menu && !definition.triggers.drop) throw new Error(`Creation entry ${definition.id} declares no trigger.`);
  if (definition.triggers.menu && !definition.InputView && definition.triggers.menu.initialInput === undefined)
    throw new Error(`Creation entry ${definition.id} needs an InputView or a menu initialInput.`);
  return { ...definition, contract } as unknown as CreationEntry;
}

const Preferences = createContext<RendererPreferences | null>(null);
export const RendererPreferencesProvider = Preferences.Provider;
export function useRendererPreferences(): RendererPreferences {
  const value = useContext(Preferences);
  if (!value) throw new Error("Renderer preferences must be provided by the host.");
  return value;
}
import type { UiText } from "./i18n.ts";
