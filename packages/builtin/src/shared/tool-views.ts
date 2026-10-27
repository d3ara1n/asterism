import type { ReactNode } from "react";
import type { ToolRenderProps } from "@asterism-app/sdk/renderer";

/** No body before results arrive; passed as a component to avoid falling back to DefaultToolBody's “No output” during execution. */
const noBody = () => null;
/** Function component form: the same component can serve argument, execution, and result states. */
type View = (props: ToolRenderProps) => ReactNode;

/** All three states share the same header; the body appears only in the final result. */
export function settledBodyViews(headerRenderer: View, bodyRenderer: View) {
  return { input: { headerRenderer }, execution: { headerRenderer, bodyRenderer: noBody }, result: { headerRenderer, bodyRenderer } };
}
