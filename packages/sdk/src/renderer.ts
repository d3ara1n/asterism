/** SDK renderer 入口：卡片与工具视图的具型作者 helper；React 由宿主共享，不打进插件 bundle。 */
import { createElement, type ComponentType, type ReactNode } from "react";
import type { z } from "zod";
import type { Json } from "./json.ts";
import type { ToolInvocationInfo, ToolResult } from "./tool-result.ts";
import { reference, type ContractReference, type DataContract } from "./presentation.ts";

/** 类型级静态识别信息，不解析卡片数据，也不创建正文组件。 */
export interface ResourceDescription {
  kind: string;
  label: string;
  icon: ReactNode;
  /** 创建前可取用的默认卡片尺寸，与卡片 renderer 共用声明。 */
  card?: CardAppearance;
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
  resolve(data: Json): CardView | null;
}
export interface ToolRenderProps<D = Json, T = Json, A = Json> {
  phase: "ready" | "executing" | "settled";
  name: string;
  target: T;
  args: A;
  invocation: ToolInvocationInfo;
  result: ToolResult<D> | null;
}
export interface ToolView {
  label?: string;
  icon?: ReactNode;
  header?: ReactNode;
  body?: ReactNode;
}
export interface ToolRenderer {
  contract: ContractReference;
  resolve(props: ToolRenderProps): ToolView | null;
}
export interface RendererModule {
  resources: ResourceDescription[];
  cards: CardRenderer[];
  tools: ToolRenderer[];
}

/** 类型擦除只发生在注册边界；组件接收到的是已通过契约校验的数据。 */
export function cardRenderer<T extends Json>(
  contract: DataContract<T>,
  definition: CardAppearance & { Body: ComponentType<{ data: T }>; Actions?: ComponentType<{ data: T }> },
): CardRenderer {
  const { Body, Actions, ...appearance } = definition;
  return { contract: reference(contract), resolve(raw) {
    const parsed = contract.schema.safeParse(raw);
    if (!parsed.success) return null;
    return { ...appearance, body: createElement(Body, { data: parsed.data }),
      actions: Actions ? createElement(Actions, { data: parsed.data }) : undefined };
  } };
}
/** header/body 独立覆盖；过程态和终结态以同一个 schema 校验，空产出仍可渲染调用摘要。 */
export function toolRenderer<D extends Json, T extends Json = Json, A extends Json = Json>(
  contract: DataContract<D> & { targetSchema?: z.ZodType<T>; tool?: { argsSchema: z.ZodType<A> } },
  definition: {
    label?: string;
    icon?: ReactNode;
    headerRenderer?: ComponentType<ToolRenderProps<D, T, A>>;
    bodyRenderer?: ComponentType<ToolRenderProps<D, T, A>>;
  },
): ToolRenderer {
  return { contract: reference(contract), resolve(props) {
    const data = props.result?.data;
    const parsed = data === null || data === undefined ? null : contract.schema.safeParse(data);
    if (parsed && !parsed.success) return null;
    const target = contract.targetSchema?.safeParse(props.target);
    const args = contract.tool?.argsSchema.safeParse(props.args);
    if (target && !target.success || args && !args.success) return null;
    // 无参数 schema 的纯数据契约保留 JSON 参数；实现契约在上面完成校验。
    const typed: ToolRenderProps<D, T, A> = {
      ...props, target: (target ? target.data : props.target) as T, args: (args ? args.data : props.args) as A,
      result: props.result ? { ...props.result, data: parsed?.data ?? null } : null,
    };
    return {
      label: definition.label, icon: definition.icon,
      header: definition.headerRenderer ? createElement(definition.headerRenderer, typed) : undefined,
      body: definition.bodyRenderer ? createElement(definition.bodyRenderer, typed) : undefined,
    };
  } };
}
