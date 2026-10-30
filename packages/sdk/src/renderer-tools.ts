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
/** Partial JSON has not passed the argument contract; fields may be missing, incomplete, or of the wrong type. */
export interface ToolInputRenderProps extends ToolCallProps<Json, Json> {
  phase: "input";
  result: null;
}
/** Waiting for scheduling and execution share a view; complete arguments have passed contract validation. */
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

/** All three states use the same two independently optional entry points; the same declaration can be reused across phases. */
export interface ToolPhaseView<P> {
  headerRenderer?: ComponentType<P>;
  bodyRenderer?: ComponentType<P>;
}
/** Input and execution views declare previewable content; bodyRenderer still owns the body layout. */
export interface ToolStreamingPhaseView<P> extends ToolPhaseView<P> {
  /** Pure function: returns true when a body suitable for streaming preview exists; after the first match within a phase, the shell manages expansion and collapse according to user preferences. */
  streaming?: (props: P) => boolean;
}
/** Execution views may additionally declare bodies that require user attention. */
export interface ToolExecutionPhaseView<P> extends ToolStreamingPhaseView<P> {
  /** Pure function: returns true when the body requires user attention; the shell immediately expands once on the first match during execution, independently of streaming preferences, and users can still collapse it. */
  attention?: (props: P) => boolean;
}
export interface ToolRendererDefinition<D = Json, T = Json, A = Json> {
  label?: UiText;
  icon?: ReactNode;
  input?: ToolStreamingPhaseView<ToolInputRenderProps>;
  execution?: ToolExecutionPhaseView<ToolExecutionRenderProps<D, T, A>>;
  result?: ToolPhaseView<ToolResultRenderProps<D, T, A>>;
}
export interface ToolView {
  label?: UiText;
  icon?: ReactNode;
  header?: ReactNode;
  body?: ReactNode;
  /** Bodies in input or execution phases may participate in streaming preview expansion and collapse; false means no match this time, and phase completion is determined by the call lifecycle. */
  streaming?: boolean;
  /** The executing body requires user attention; the shell expands once when this first becomes true within the phase. */
  attention?: boolean;
}
export interface ToolRenderer {
  contract: ContractReference;
  /** Display name of the tool, readable without rendering a call. */
  label?: UiText;
  resolve(props: ToolRenderProps): ToolView | null;
}

function render<P extends { phase: ToolRenderProps["phase"] }>(
  definition: Pick<ToolView, "label" | "icon">, view: ToolExecutionPhaseView<P> | undefined, props: P,
): ToolView {
  return {
    label: definition.label, icon: definition.icon,
    header: view?.headerRenderer ? createElement(view.headerRenderer, props) : undefined,
    body: view?.bodyRenderer ? createElement(view.bodyRenderer, props) : undefined,
    streaming: (props.phase === "input" || props.phase === "executing")
      && !!view?.bodyRenderer && (view.streaming?.(props) ?? false),
    attention: props.phase === "executing" && !!view?.bodyRenderer && (view.attention?.(props) ?? false),
  };
}

/** Dispatch by phase; streaming input is not treated as valid arguments, while execution and results share complete argument and output validation. */
export function toolRenderer<D extends Json, T extends Json = Json, A extends Json = Json>(
  contract: DataContract<D> & { targetSchema?: z.ZodType<T>; tool?: { argsSchema: z.ZodType<A> } },
  definition: ToolRendererDefinition<D, T, A>,
): ToolRenderer {
  return { contract: reference(contract), label: definition.label, resolve(props) {
    if (props.phase === "input") return definition.input ? render(definition, definition.input, props) : null;
    const data = props.result?.data;
    const parsed = data === null || data === undefined ? null : contract.schema.safeParse(data);
    if (parsed && !parsed.success) return null;
    const target = contract.targetSchema?.safeParse(props.target);
    const args = contract.tool?.argsSchema.safeParse(props.args);
    if (target && !target.success || args && !args.success) return null;
    // Pure data contracts without an argument schema preserve raw JSON; type erasure occurs only at the registration boundary.
    const input = { target: (target ? target.data : props.target) as T, args: (args ? args.data : props.args) as A };
    if (props.phase === "settled") return render(definition, definition.result, {
      ...props, ...input, result: { ...props.result, data: parsed?.data ?? null },
    });
    return render(definition, definition.execution, {
      ...props, ...input, result: props.result ? { ...props.result, data: parsed?.data ?? null } : null,
    });
  } };
}
