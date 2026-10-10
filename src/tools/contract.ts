import { z } from "zod";
import { jsonSchema, type Json } from "../shared/json.ts";
import type { ToolOutcome } from "../shared/model.ts";
import type { ImplementationContract, ToolContract } from "../shared/module-contract.ts";
import { reference, type ContractReference } from "../shared/presentation.ts";
import type { FoldedObject } from "../session/fold.ts";
import { jsonArgumentHint, validationMessage } from "./validation.ts";

export type CallResult<O extends Json> =
  | { kind: "succeeded"; data: O }
  | { kind: "partial"; data: O; message: string }
  | Exclude<ToolOutcome, { kind: "succeeded" | "partial" }>;
export interface Invocation {
  effect: "read" | "write";
  execution: "parallel" | "sequential";
  implementation?: ContractReference;
  execute(signal: AbortSignal): Promise<ToolOutcome>;
}
/** 注册目录保存擦除后的 adapter，具体类型与校验封装在 implement 内。 */
export interface ToolImplementation {
  reference: ContractReference;
  resourceKind: string;
  tool: ToolContract;
  description: string;
  targetSchema: z.ZodType<Json>;
  resultSchema: z.ZodType<Json>;
  prepare(resource: FoldedObject, target: Json, args: Json): Invocation | ToolOutcome;
}
export function schemaOf(schema: z.ZodType<Json>): Json {
  return jsonSchema.parse(z.toJSONSchema(schema));
}
export function implement<S extends Json, T extends Json, A extends Json, O extends Json>(
  contract: ImplementationContract<S, T, A, O>,
  implementation: {
    call(state: S, target: T, args: A, context: { signal: AbortSignal; resource: FoldedObject }): Promise<CallResult<O>>;
    toModel?: (result: O) => Json;
  },
): ToolImplementation {
  const identity = reference(contract);
  return {
    reference: identity, resourceKind: contract.resource.kind, tool: contract.tool, description: contract.description,
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
        async execute(signal) {
          const result = await implementation.call(state.data, parsedTarget.data, parsedArgs.data, { signal, resource });
          if (result.kind !== "succeeded" && result.kind !== "partial") return { ...result, implementation: identity };
          const data = contract.schema.parse(result.data);
          const model = jsonSchema.parse(implementation.toModel ? implementation.toModel(data) : data);
          return { ...result, data, model, implementation: identity };
        },
      };
    },
  };
}
