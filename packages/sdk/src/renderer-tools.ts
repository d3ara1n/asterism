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
/** 输入与执行视图声明可预览内容，正文布局仍由 bodyRenderer 拥有。 */
export interface ToolStreamingPhaseView<P> extends ToolPhaseView<P> {
  /** 纯函数：已有适合流式预览的正文时返回 true；同阶段首次命中后由外壳按用户偏好管理开合。 */
  streaming?: (props: P) => boolean;
}
export interface ToolRendererDefinition<D = Json, T = Json, A = Json> {
  label?: UiText;
  icon?: ReactNode;
  input?: ToolStreamingPhaseView<ToolInputRenderProps>;
  execution?: ToolStreamingPhaseView<ToolExecutionRenderProps<D, T, A>>;
  result?: ToolPhaseView<ToolResultRenderProps<D, T, A>>;
}
export interface ToolView {
  label?: UiText;
  icon?: ReactNode;
  header?: ReactNode;
  body?: ReactNode;
  /** 输入或执行中的正文可参与流式预览开合；false 表示本次未命中，阶段结束由调用生命周期决定。 */
  streaming?: boolean;
}
export interface ToolRenderer {
  contract: ContractReference;
  resolve(props: ToolRenderProps): ToolView | null;
}

function render<P extends { phase: ToolRenderProps["phase"] }>(
  definition: Pick<ToolView, "label" | "icon">, view: ToolStreamingPhaseView<P> | undefined, props: P,
): ToolView {
  return {
    label: definition.label, icon: definition.icon,
    header: view?.headerRenderer ? createElement(view.headerRenderer, props) : undefined,
    body: view?.bodyRenderer ? createElement(view.bodyRenderer, props) : undefined,
    streaming: (props.phase === "input" || props.phase === "executing")
      && !!view?.bodyRenderer && (view.streaming?.(props) ?? false),
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
