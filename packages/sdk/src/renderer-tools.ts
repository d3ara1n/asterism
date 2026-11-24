import { createElement, type ComponentType, type ReactNode } from "react";
import type { z } from "zod";
import type { UiText } from "./i18n.ts";
import type { Json } from "./json.ts";
import type { ToolInputDraft } from "./models.ts";
import { reference, type ContractReference, type DataContract } from "./presentation.ts";
import type { ToolCompletion, ToolInvocationInfo, ToolResult } from "./tool-result.ts";

interface ToolIdentityProps {
  name: string;
  invocation: ToolInvocationInfo;
}
interface ToolCallProps<T, A> extends ToolIdentityProps {
  kind?: "structured";
  target: T;
  args: A;
}
/** Partial JSON has not passed the argument contract. */
export interface ToolInputRenderProps extends ToolCallProps<Json, Json> {
  phase: "input";
  result: null;
  /** Original unfinished input; the host derives a display-only preview when resolving the view. */
  draft?: ToolInputDraft | null;
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

/** A freeform renderer receives exact text, including an empty string; null means no text was captured. */
interface FreeformCallProps extends ToolIdentityProps {
  kind: "freeform";
  text: string | null;
}
export type FreeformToolInputRenderProps = FreeformCallProps & { phase: "input"; result: null };
export type FreeformToolExecutionRenderProps<D = Json> = FreeformCallProps & Pick<ToolExecutionRenderProps<D>, "phase" | "result">;
export type FreeformToolResultRenderProps<D = Json> = FreeformCallProps & Pick<ToolResultRenderProps<D>, "phase" | "result">;
export type FreeformToolRenderProps<D = Json> = FreeformToolInputRenderProps | FreeformToolExecutionRenderProps<D> | FreeformToolResultRenderProps<D>;
/** Used by the conversation host before resolving a specific renderer. */
export type AnyToolRenderProps = ToolRenderProps | FreeformToolRenderProps;

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
interface ToolViewOptions {
  label?: UiText;
  icon?: ReactNode;
  /** Whether the conversation shell exposes raw call/result details; defaults to true. */
  details?: boolean;
}
export interface ToolRendererDefinition<D = Json, T = Json, A = Json> extends ToolViewOptions {
  input?: ToolStreamingPhaseView<ToolInputRenderProps>;
  execution?: ToolExecutionPhaseView<ToolExecutionRenderProps<D, T, A>>;
  result?: ToolPhaseView<ToolResultRenderProps<D, T, A>>;
}
export interface FreeformToolRendererDefinition<D = Json> extends ToolViewOptions {
  input?: ToolStreamingPhaseView<FreeformToolInputRenderProps>;
  execution?: ToolExecutionPhaseView<FreeformToolExecutionRenderProps<D>>;
  result?: ToolPhaseView<FreeformToolResultRenderProps<D>>;
}
export interface ToolView {
  label?: UiText;
  icon?: ReactNode;
  details?: boolean;
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
  /** Static operation icon, available to call summaries without rendering arguments or results. */
  icon?: ReactNode;
  resolve(props: AnyToolRenderProps): ToolView | null;
}

function render<P extends { phase: ToolRenderProps["phase"] }>(
  definition: Pick<ToolView, "label" | "icon" | "details">, view: ToolExecutionPhaseView<P> | undefined, props: P,
): ToolView {
  return {
    label: definition.label, icon: definition.icon, details: definition.details,
    header: view?.headerRenderer ? createElement(view.headerRenderer, props) : undefined,
    body: view?.bodyRenderer ? createElement(view.bodyRenderer, props) : undefined,
    streaming: (props.phase === "input" || props.phase === "executing")
      && !!view?.bodyRenderer && (view.streaming?.(props) ?? false),
    attention: props.phase === "executing" && !!view?.bodyRenderer && (view.attention?.(props) ?? false),
  };
}

type StructuredViewContract<D extends Json, T extends Json, A extends Json> = DataContract<D> & {
  kind?: "structured";
  targetSchema?: z.ZodType<T>;
  tool?: { kind?: "structured"; argsSchema: z.ZodType<A> };
};
type FreeformViewContract<D extends Json> = (DataContract<D> & { tool: { kind: "freeform" } })
  | (ContractReference & { kind: "freeform"; resultSchema: z.ZodType<D> });

/** Structured and freeform views match only their own input kind. Completed result data is decoded in either case. */
export function toolRenderer<D extends Json>(contract: FreeformViewContract<D>, definition: FreeformToolRendererDefinition<D>): ToolRenderer;
export function toolRenderer<D extends Json, T extends Json = Json, A extends Json = Json>(
  contract: StructuredViewContract<D, T, A>, definition: ToolRendererDefinition<D, T, A>,
): ToolRenderer;
export function toolRenderer<D extends Json, T extends Json, A extends Json>(
  contract: StructuredViewContract<D, T, A> | FreeformViewContract<D>,
  definition: ToolRendererDefinition<D, T, A> | FreeformToolRendererDefinition<D>,
): ToolRenderer {
  if (isFreeform(contract)) {
    const view = definition as FreeformToolRendererDefinition<D>;
    const schema = "resultSchema" in contract ? contract.resultSchema : contract.schema;
    return { contract: reference(contract), label: view.label, icon: view.icon, resolve(props) {
      if (props.kind !== "freeform") return null;
      if (props.phase === "input") return view.input ? render(view, view.input, props) : null;
      const data = decodeData(schema, props.result?.data);
      if (data === undefined) return null;
      if (props.phase === "settled") return render(view, view.result, { ...props, result: { ...props.result, data } });
      return render(view, view.execution, { ...props, result: props.result ? { ...props.result, data } : null });
    } };
  }
  const view = definition as ToolRendererDefinition<D, T, A>;
  return { contract: reference(contract), label: view.label, icon: view.icon, resolve(props) {
    if (props.kind === "freeform") return null;
    if (props.phase === "input") return view.input ? render(view, view.input, props) : null;
    const data = decodeData(contract.schema, props.result?.data);
    if (data === undefined) return null;
    const target = contract.targetSchema?.safeParse(props.target);
    const args = contract.tool?.argsSchema.safeParse(props.args);
    if (target && !target.success || args && !args.success) return null;
    // Pure data contracts without an argument schema preserve raw JSON; type erasure occurs only at the registration boundary.
    const input = { target: (target ? target.data : props.target) as T, args: (args ? args.data : props.args) as A };
    if (props.phase === "settled") return render(view, view.result, { ...props, ...input, result: { ...props.result, data } });
    return render(view, view.execution, { ...props, ...input, result: props.result ? { ...props.result, data } : null });
  } };
}
function isFreeform<D extends Json>(contract: StructuredViewContract<D, Json, Json> | FreeformViewContract<D>): contract is FreeformViewContract<D> {
  return ("kind" in contract && contract.kind === "freeform") || ("tool" in contract && contract.tool?.kind === "freeform");
}
/** Undefined is reserved for invalid data; null denotes absent data and bypasses the schema. */
function decodeData<D extends Json>(schema: z.ZodType<D>, data: Json | undefined): D | null | undefined {
  if (data === null || data === undefined) return null;
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}
