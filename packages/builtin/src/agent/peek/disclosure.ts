import type { ToolRenderProps } from "@atelier/sdk/renderer";
import { AgentPeek, peekResultSchema } from "./contract";
import type { ToolDisclosure } from "../conversation/tool-state";

export type PeekDisclosure = ToolDisclosure & { reportStage?: "streaming" | "settled" };

/** 内置 Agent 按自身工具的稳定实现身份应用报告偏好，覆盖实现仍使用普通工具规则。 */
export function advancePeekDisclosure(state: PeekDisclosure, props: ToolRenderProps | undefined, preferences: {
  peekAutoExpand: boolean; peekAutoCollapse: boolean;
}): PeekDisclosure {
  if (props?.invocation.implementation?.id !== AgentPeek.id) return state;
  if (props.phase === "settled") return state.reportStage === "streaming"
    ? { ...state, reportStage: "settled", open: preferences.peekAutoCollapse ? false : state.open } : state;
  if (props.phase !== "executing" || state.reportStage) return state;
  const parsed = peekResultSchema.safeParse(props.result?.data);
  return parsed.success && parsed.data.report.length > 0
    ? { ...state, reportStage: "streaming", open: preferences.peekAutoExpand ? true : state.open } : state;
}
