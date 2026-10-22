import type { ToolRenderProps } from "@atelier/sdk/renderer";
import { AgentPeek, peekResultSchema } from "../peek/contract";
import { DirectoryExec } from "../../filesystem/exec-contract";
import { execResultSchema } from "../../shell/contract";
import { advanceStreamingDisclosure, type StreamingPreferences } from "../../shared/streaming-disclosure";
import type { ToolDisclosure } from "./tool-state";

export type ToolOutputDisclosure = ToolDisclosure & { outputStage?: "streaming" | "settled" };

/** 工具只识别首段可见产出；开合规则由公共预览状态机处理。 */
function hasStreamingOutput(props: ToolRenderProps): boolean {
  switch (props.invocation.implementation?.id) {
    case AgentPeek.id: {
      const parsed = peekResultSchema.safeParse(props.result?.data);
      return parsed.success && parsed.data.report.length > 0;
    }
    case DirectoryExec.id: {
      const parsed = execResultSchema.safeParse(props.result?.data);
      return parsed.success && parsed.data.output.length > 0;
    }
    default: return false;
  }
}

export function advanceToolOutputDisclosure(
  state: ToolOutputDisclosure, props: ToolRenderProps | undefined, preferences: StreamingPreferences,
): ToolOutputDisclosure {
  if (!props) return state;
  if (props.phase === "settled") return state.outputStage === "streaming"
    ? { ...advanceStreamingDisclosure(state, false, preferences), outputStage: "settled" } : state;
  if (props.phase !== "executing" || state.outputStage || !hasStreamingOutput(props)) return state;
  return { ...advanceStreamingDisclosure(state, true, preferences), outputStage: "streaming" };
}
