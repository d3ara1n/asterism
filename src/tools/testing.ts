/** Executor tests need only resource data and tool handlers; validation and finalization still use real SDK implementations. */
import { implementTool, type ObjectExecutor, type CallResult } from "@asterism-app/sdk/runtime";
import { reference, type Json, type ImplementationContract, type ToolModelOutput } from "@asterism-app/sdk/contracts";
import { resourceSnapshot } from "../plugins/records.ts";
import type { ToolImplementation } from "./contract.ts";

export const toolCaller = { ref: { sessionId: "test", id: "caller", kind: "test/agent" }, title: "Caller" };
export function implement<S extends Json, T extends Json, A extends Json, D extends Json>(
  contract: ImplementationContract<S, T, A, D>,
  definition: { call(data: S, target: T, args: A, context: { signal: AbortSignal; publish(data: NoInfer<D>): void }): Promise<CallResult<NoInfer<D>>>; toModel?(data: D): ToolModelOutput },
): ToolImplementation {
  const contribution = implementTool(contract, definition);
  return {
    reference: reference(contract), resourceKind: contract.resource.kind, tool: contract.tool,
    effect: contract.effect, targetSchema: contract.targetSchema, resultSchema: contract.schema,
    prepare(resource, target, args, caller, interactive = true) {
      const snapshot = resourceSnapshot({ sessionId: "test", id: resource.id, kind: resource.kind }, resource);
      // These pure execution test handlers do not use object capabilities; sdk-runtime.test.ts verifies real object binding.
      return contribution.prepare(snapshot, undefined as unknown as ObjectExecutor, target, args, caller, interactive);
    },
  };
}
