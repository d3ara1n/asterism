import { createElement, type ComponentType, type ReactNode } from "react";
import type { z } from "zod";
import type { UiText } from "./i18n.ts";
import type { Json } from "./json.ts";
import { reference, type ContractReference, type DataContract } from "./presentation.ts";
import type { ToolCompletion, ToolInvocationInfo, ToolResult } from "./tool-result.ts";

interface ToolCallProps<T, A> {
  name: string;
  target: T;
  args: A;
  invocation: ToolInvocationInfo;
}
/** 部分 JSON 尚未通过参数契约；字段可能缺失、未完成或类型不符。 */
export interface ToolInputRenderProps extends ToolCallProps<Json, Json> {
  phase: "input";
  result: null;
}
/** 等待调度与执行共用视图，完整参数已通过契约校验。 */
export interface ToolExecutionRenderProps<D = Json, T = Json, A = Json> extends ToolCallProps<T, A> {
  phase: "ready" | "executing";
  result: Extract<ToolResult<D>, { kind: "running" }> | null;
}
export interface ToolResultRenderProps<D = Json, T = Json, A = Json> extends ToolCallProps<T, A> {
  phase: "settled";
  result: ToolCompletion<D>;
}
export type ToolRenderProps<D = Json, T = Json, A = Json> =
  | ToolInputRenderProps | ToolExecutionRenderProps<D, T, A> | ToolResultRenderProps<D, T, A>;

/** 三态使用相同的两个独立可选入口；可在多个阶段复用同一份声明。 */
export interface ToolPhaseView<P> {
  headerRenderer?: ComponentType<P>;
  bodyRenderer?: ComponentType<P>;
}
export interface ToolRendererDefinition<D = Json, T = Json, A = Json> {
  label?: UiText;
  icon?: ReactNode;
  input?: ToolPhaseView<ToolInputRenderProps>;
  execution?: ToolPhaseView<ToolExecutionRenderProps<D, T, A>>;
  result?: ToolPhaseView<ToolResultRenderProps<D, T, A>>;
}
export interface ToolView {
  label?: UiText;
  icon?: ReactNode;
  header?: ReactNode;
  body?: ReactNode;
}
export interface ToolRenderer {
  contract: ContractReference;
  resolve(props: ToolRenderProps): ToolView | null;
}

function render<P extends object>(definition: Pick<ToolView, "label" | "icon">, view: ToolPhaseView<P> | undefined, props: P): ToolView {
  return {
    label: definition.label, icon: definition.icon,
    header: view?.headerRenderer ? createElement(view.headerRenderer, props) : undefined,
    body: view?.bodyRenderer ? createElement(view.bodyRenderer, props) : undefined,
  };
}

/** 按阶段分派；填充不冒充有效参数，执行和结果共用完整参数与产出校验。 */
export function toolRenderer<D extends Json, T extends Json = Json, A extends Json = Json>(
  contract: DataContract<D> & { targetSchema?: z.ZodType<T>; tool?: { argsSchema: z.ZodType<A> } },
  definition: ToolRendererDefinition<D, T, A>,
): ToolRenderer {
  return { contract: reference(contract), resolve(props) {
    if (props.phase === "input") return definition.input ? render(definition, definition.input, props) : null;
    const data = props.result?.data;
    const parsed = data === null || data === undefined ? null : contract.schema.safeParse(data);
    if (parsed && !parsed.success) return null;
    const target = contract.targetSchema?.safeParse(props.target);
    const args = contract.tool?.argsSchema.safeParse(props.args);
    if (target && !target.success || args && !args.success) return null;
    // 无参数 schema 的纯数据契约保留原始 JSON，类型擦除只发生在注册边界。
    const input = { target: (target ? target.data : props.target) as T, args: (args ? args.data : props.args) as A };
    if (props.phase === "settled") return render(definition, definition.result, {
      ...props, ...input, result: { ...props.result, data: parsed?.data ?? null },
    });
    return render(definition, definition.execution, {
      ...props, ...input, result: props.result ? { ...props.result, data: parsed?.data ?? null } : null,
    });
  } };
}
