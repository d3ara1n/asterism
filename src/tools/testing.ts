/** 执行器测试只需资源 data 与工具 handler；校验和终结仍使用真实 SDK 实现。 */
import { implementTool, type ObjectExecutor, type CallResult } from "@atelier/sdk/runtime";
import { reference, type Json, type ImplementationContract } from "@atelier/sdk/contracts";
import { resourceSnapshot } from "../plugins/records.ts";
import type { ToolImplementation } from "./contract.ts";

export function implement<S extends Json, T extends Json, A extends Json, D extends Json>(
  contract: ImplementationContract<S, T, A, D>,
  definition: { call(data: S, target: T, args: A, context: { signal: AbortSignal; publish(data: NoInfer<D>): void }): Promise<CallResult<NoInfer<D>>>; toModel?(data: D): Json },
): ToolImplementation {
  const contribution = implementTool(contract, definition);
  return {
    reference: reference(contract), resourceKind: contract.resource.kind, tool: contract.tool,
    effect: contract.effect, targetSchema: contract.targetSchema, resultSchema: contract.schema,
    prepare(resource, target, args) {
      const snapshot = resourceSnapshot({ sessionId: "test", id: resource.id, kind: resource.kind }, resource);
      // 这些纯执行测试的 handler 不取用对象能力；真实对象绑定在 sdk-runtime.test.ts 验证。
      return contribution.prepare(snapshot, undefined as unknown as ObjectExecutor, target, args);
    },
  };
}
