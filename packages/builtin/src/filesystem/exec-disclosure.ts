import type { ToolRenderProps } from "@atelier/sdk/renderer";
import { DirectoryExec } from "./exec-contract.ts";
import { execResultSchema } from "../shell/contract.ts";

export type ExecDisclosure = { execOutputShown?: boolean };
/** 首次输出展开一次，后续输出和终结保留用户选择；历史初次挂载仍为折叠。 */
export function advanceExecDisclosure<T extends ExecDisclosure & { open: boolean }>(state: T, props: ToolRenderProps | undefined): T {
  if (state.execOutputShown || !props || props.invocation.implementation?.id !== DirectoryExec.id || props.phase !== "executing") return state;
  const parsed = execResultSchema.safeParse(props.result?.data);
  return parsed.success && parsed.data.output.length > 0 ? { ...state, execOutputShown: true, open: true } : state;
}
