import type { z } from "zod";
import { jsonSchema, type Json } from "@atelier/sdk/contracts";
import type { ToolCompletion, ToolInvocationInfo } from "@atelier/sdk/contracts";
import type { ImplementationContract, ToolContract } from "@atelier/sdk/contracts";
import { reference, type ContractReference } from "@atelier/sdk/contracts";
import type { FoldedObject } from "../session/fold.ts";
import { jsonArgumentHint, validationMessage } from "./validation.ts";

/** 失败可省略 data，执行层保留最近一次合法产出；显式 null 则清空。 */
type OptionalData<T, D> = T extends unknown ? Omit<T, "data"> & { data?: D | null } : never;
export type CallResult<D extends Json = Json> =
  | { kind: "succeeded"; data: D }
  | { kind: "partial"; data: D; message: string }
  | OptionalData<Exclude<ToolCompletion, { kind: "succeeded" | "partial" }>, D>;
export type PreparedResult = CallResult & ToolInvocationInfo;
export interface Invocation extends ToolInvocationInfo {
  effect: "read" | "write";
  execution: "parallel" | "sequential";
  execute(signal: AbortSignal, publish?: (data: Json) => void): Promise<CallResult>;
  toModel?: (data: Json) => Json;
}
/** 注册目录保存擦除后的 adapter，具体类型与校验封装在 implement 内。 */
export interface ToolImplementation {
  reference: ContractReference;
  resourceKind: string;
  tool: ToolContract;
  effect: "read" | "write";
  targetSchema: z.ZodType<Json>;
  resultSchema: z.ZodType<Json>;
  prepare(resource: FoldedObject, target: Json, args: Json): Invocation | PreparedResult;
}
export function implement<S extends Json, T extends Json, A extends Json, D extends Json>(
  contract: ImplementationContract<S, T, A, D>,
  implementation: {
    call(state: S, target: T, args: A, context: {
      signal: AbortSignal; resource: FoldedObject; publish(data: D): void;
    }): Promise<CallResult<D>>;
    toModel?: (data: D) => Json;
  },
): ToolImplementation {
  const identity = reference(contract);
  return {
    reference: identity, resourceKind: contract.resource.kind, tool: contract.tool, effect: contract.effect,
    targetSchema: contract.targetSchema, resultSchema: contract.schema,
    prepare(resource, target, args) {
      const state = contract.resource.stateSchema.safeParse(resource.data);
      if (!state.success) return { kind: "failed", implementation: identity, error: { code: "invalid_resource", message: "The resource state does not match its backend contract." } };
      const parsedTarget = contract.targetSchema.safeParse(target);
      const parsedArgs = contract.tool.argsSchema.safeParse(args);
      if (!parsedTarget.success || !parsedArgs.success) return { kind: "rejected", implementation: identity,
        error: { code: "invalid_arguments", message: [
          `Invalid arguments for ${contract.resource.kind}/${contract.tool.name}.`,
          ...(!parsedTarget.success ? [validationMessage(parsedTarget.error, "target")] : []),
          ...(!parsedArgs.success ? [validationMessage(parsedArgs.error, "args")] : []),
          jsonArgumentHint,
          "Correct the reported fields using this resource's tool schemas from resource_inspect and retry.",
        ].join("\n") } };
      return {
        effect: contract.effect, execution: contract.execution, implementation: identity,
        toModel: data => jsonSchema.parse(implementation.toModel ? implementation.toModel(contract.schema.parse(data)) : data),
        async execute(signal, publish) {
          let active = true;
          const snapshot = (data: unknown) => jsonSchema.parse(contract.schema.parse(data));
          try {
            const result = await implementation.call(state.data, parsedTarget.data, parsedArgs.data, { signal, resource,
              publish(data) {
                if (!active) return;
                const value = snapshot(data);
                publish?.(value);
              },
            });
            if (result.kind === "succeeded" || result.kind === "partial") {
              if (result.data === undefined) throw new Error("The tool did not provide final data.");
            } else if (result.data === undefined || result.data === null) return result;
            return { ...result, data: snapshot(result.data) };
          } finally { active = false; }
        },
      };
    },
  };
}
