import type { z } from "zod";
import type { Json } from "@atelier/sdk/contracts";
import type { ToolInvocationInfo } from "@atelier/sdk/contracts";
import type { ToolContract } from "@atelier/sdk/contracts";
import type { ContractReference } from "@atelier/sdk/contracts";
import type { FoldedObject } from "../session/fold.ts";

export type { CallResult } from "@atelier/sdk/runtime";
import type { CallResult } from "@atelier/sdk/runtime";
export type PreparedResult = CallResult & ToolInvocationInfo;
export interface Invocation extends ToolInvocationInfo {
  effect: "read" | "write";
  execution: "parallel" | "sequential";
  execute(signal: AbortSignal, publish?: (data: Json) => void): Promise<CallResult>;
  toModel?: (data: Json) => Json;
}
/** 宿主目录保存 SDK 贡献适配后的执行接口。 */
export interface ToolImplementation {
  reference: ContractReference;
  resourceKind: string;
  tool: ToolContract;
  effect: "read" | "write";
  targetSchema: z.ZodType<Json>;
  resultSchema: z.ZodType<Json>;
  prepare(resource: FoldedObject, target: Json, args: Json): Invocation | PreparedResult;
}
