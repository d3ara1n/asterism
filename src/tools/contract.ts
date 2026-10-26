import type { z } from "zod";
import type { Json, ToolModelOutput } from "@asterism/sdk/contracts";
import type { ToolInvocationInfo } from "@asterism/sdk/contracts";
import type { ToolContract } from "@asterism/sdk/contracts";
import type { ContractReference } from "@asterism/sdk/contracts";
import type { FoldedObject } from "../session/fold.ts";
import type { ContentLease } from "../runtime/content-store.ts";
import type { ToolCaller } from "@asterism/sdk/runtime";

export type { CallResult } from "@asterism/sdk/runtime";
import type { CallResult } from "@asterism/sdk/runtime";
export type PreparedResult = CallResult & ToolInvocationInfo;
export interface Invocation extends ToolInvocationInfo {
  effect: "read" | "write";
  execution: "parallel" | "sequential";
  execute(signal: AbortSignal, publish?: (data: Json) => void, handover?: ContentLease): Promise<CallResult>;
  toModel?: (data: Json) => ToolModelOutput;
}
/** 宿主目录保存 SDK 贡献适配后的执行接口。 */
export interface ToolImplementation {
  reference: ContractReference;
  resourceKind: string;
  tool: ToolContract;
  effect: "read" | "write";
  targetSchema: z.ZodType<Json>;
  resultSchema: z.ZodType<Json>;
  prepare(resource: FoldedObject, target: Json, args: Json, caller: ToolCaller): Invocation | PreparedResult;
}
