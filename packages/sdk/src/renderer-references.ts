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
