import type { UiText } from "./i18n.ts";
import type { RendererCalls } from "./renderer-calls.ts";
import type { ResourceRef } from "./workspace.ts";

/**
 * Drag transfer of references. The payload is reference text: Markdown links whose destinations are reference URLs,
 * such as `[guide.md](resource:Dir-A/docs/guide.md)`. Any plugin view can be a source and any input can be a target;
 * the transfer carries only text, so targets that do not read this type ignore the drag.
 */
export const referenceDragType = "application/vnd.asterism.reference";

/** Start a reference drag from a `dragstart` event. */
export function setReferenceDrag(transfer: DataTransfer, text: string): void {
  transfer.setData(referenceDragType, text);
  transfer.effectAllowed = "copy";
}

/** Whether a drag carries references; readable during `dragover`, when payload contents are not yet exposed. */
export function hasReferenceDrag(transfer: DataTransfer): boolean {
  return transfer.types.includes(referenceDragType);
}

/** Reference text of a `drop` event; null when the drag carries no references. */
export function readReferenceDrag(transfer: DataTransfer): string | null {
  return hasReferenceDrag(transfer) ? transfer.getData(referenceDragType) : null;
}

/** A selectable resource location. Its owner interprets the location; the picker only encodes it. */
export interface ReferenceTarget {
  readonly label: string;
  readonly detail?: UiText;
  /** Resource-owned location; the empty location is reserved for the resource itself. */
  readonly location: string;
}
export interface ListedReferenceTarget extends ReferenceTarget {
  /** Additional local filtering keys. Presentation detail is not searched. */
  readonly keywords?: readonly string[];
}
export interface ReferenceTargetContext {
  readonly resource: ResourceRef;
  readonly calls: RendererCalls;
  readonly signal: AbortSignal;
}
export type ReferenceTargetProvider =
  | { readonly kind: "list"; list(context: ReferenceTargetContext): Promise<readonly ListedReferenceTarget[]> }
  | {
    readonly kind: "search";
    readonly prompt?: UiText;
    readonly refineHint?: UiText;
    search(query: string, context: ReferenceTargetContext): Promise<{
      readonly items: readonly ReferenceTarget[];
      /** Results stopped at a provider limit. Refine the query instead of paging. */
      readonly limited: boolean;
    }> };
