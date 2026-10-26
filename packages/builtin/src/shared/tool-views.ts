import type { ReactNode } from "react";
import type { ToolRenderProps } from "@asterism/sdk/renderer";

/** 结果到达前没有正文；以组件形式传入，避免执行中回落到 DefaultToolBody 的“没有输出”。 */
const noBody = () => null;
/** 函数组件形式：同一组件可同时用于参数、执行与结果三态。 */
type View = (props: ToolRenderProps) => ReactNode;

/** 三态共用同一 header；正文只在终结结果中出现。 */
export function settledBodyViews(headerRenderer: View, bodyRenderer: View) {
  return { input: { headerRenderer }, execution: { headerRenderer, bodyRenderer: noBody }, result: { headerRenderer, bodyRenderer } };
}
