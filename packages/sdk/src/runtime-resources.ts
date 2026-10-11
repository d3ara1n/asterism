import type { z } from "zod";
import { jsonSchema, type Json } from "./json.ts";
import type { ResourceContract, ImplementationContract } from "./module-contract.ts";
import type { RecordContract } from "./records.ts";
import { reference, present, type DataContract } from "./presentation.ts";
import { PluginApiError } from "./runtime.ts";
import type { ContextFile, ObjectContext, ResourceContribution, ToolContribution, Preparation, CallResult } from "./runtime-contracts.ts";
import { validationMessage, jsonArgumentHint } from "./tool-validation.ts";

function parse<T>(schema: z.ZodType<T>, input: unknown, subject: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new PluginApiError("invalid_argument", validationMessage(result.error, subject));
  return result.data;
}
/** 具型实现进入共享贡献接口时才擦除类型；JSON/schema 校验不依赖宿主注册表。 */
export function implementResource<S extends Json, V extends Json, I extends Json = Json, C extends Json = Json>(
  resource: ResourceContract<S>, view: DataContract<V>, definition: {
    records?: readonly RecordContract[];
    links?: ResourceContribution["links"];
    creation?: {
      schema: z.ZodType<I>;
      prepare?(input: NoInfer<I>, signal: AbortSignal): Promise<NoInfer<I>>;
      create(input: NoInfer<I>, object: ObjectContext): { title: string; data: NoInfer<S> };
    };
    actions?: {
      schema: z.ZodType<C>;
      prepare?(input: NoInfer<C>, object: ObjectContext, signal: AbortSignal): Preparation<NoInfer<C>> | Promise<Preparation<NoInfer<C>>>;
      execute(input: NoInfer<C>, object: ObjectContext, signal: AbortSignal): Promise<void>;
    };
    project(data: NoInfer<S>, object: ObjectContext): NoInfer<V>;
    inspect(data: NoInfer<S>, object: ObjectContext): Promise<Json>;
    context?(data: NoInfer<S>, object: ObjectContext): Promise<ContextFile[]>;
  },
): ResourceContribution {
  const { creation, actions } = definition;
  return {
    resource, records: [...definition.records ?? []], links: definition.links,
    ...(creation ? { creation: {
      schema: creation.schema as z.ZodType<Json>,
      ...(creation.prepare ? { async prepare(input: Json, signal: AbortSignal) {
        return jsonSchema.parse(parse(creation.schema, await creation.prepare!(parse(creation.schema, input, "input"), signal), "input"));
      } } : {}),
      create(input: Json, object: ObjectContext) {
        const result = creation.create(parse(creation.schema, input, "input"), object);
        return { title: result.title, data: jsonSchema.parse(parse(resource.stateSchema, result.data, "resource")) };
      },
    } } : {}),
    ...(actions ? { actions: {
      schema: actions.schema as z.ZodType<Json>,
      ...(actions.prepare ? { async prepare(input: Json, object: ObjectContext, signal: AbortSignal): Promise<Preparation> {
        const result = await actions.prepare!(parse(actions.schema, input, "input"), object, signal);
        return result.action === "replace"
          ? { action: "replace", input: jsonSchema.parse(parse(actions.schema, result.input, "input")) } : result;
      } } : {}),
      execute: (input: Json, object: ObjectContext, signal: AbortSignal) => actions.execute(parse(actions.schema, input, "input"), object, signal),
    } } : {}),
    project: (snapshot, object) => present(view, definition.project(parse(resource.stateSchema, snapshot.data, "resource"), object)),
    inspect: async (snapshot, object) => jsonSchema.parse(await definition.inspect(parse(resource.stateSchema, snapshot.data, "resource"), object)),
    context: async (snapshot, object) => definition.context?.(parse(resource.stateSchema, snapshot.data, "resource"), object) ?? [],
  };
}
export function implementTool<S extends Json, T extends Json, A extends Json, D extends Json>(
  contract: ImplementationContract<S, T, A, D>, definition: {
    call(data: S, target: T, args: A, context: {
      object: ObjectContext; signal: AbortSignal; publish(data: NoInfer<D>): void;
    }): Promise<CallResult<NoInfer<D>>>;
    toModel?(data: D): Json;
  },
): ToolContribution {
  const identity = reference(contract);
  return {
    contract: contract as unknown as ToolContribution["contract"],
    prepare(resource, object, target, args) {
      const state = contract.resource.stateSchema.safeParse(resource.data);
      if (!state.success) return { kind: "failed", implementation: identity,
        error: { code: "invalid_resource", message: "The resource state does not match its backend contract." } };
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
        toModel: data => jsonSchema.parse(definition.toModel ? definition.toModel(contract.schema.parse(data)) : data),
        async execute(signal, publish) {
          let active = true;
          const snapshot = (data: unknown) => jsonSchema.parse(contract.schema.parse(data));
          try {
            const result = await definition.call(state.data, parsedTarget.data, parsedArgs.data, { object, signal,
              publish(data) { if (active) publish?.(snapshot(data)); } });
            if (result.kind === "succeeded" || result.kind === "partial") {
              if (result.data === undefined) throw new PluginApiError("invalid_argument", "The tool did not provide final data.");
            } else if (result.data === undefined || result.data === null) return result;
            return { ...result, data: snapshot(result.data) };
          } finally { active = false; }
        },
      };
    },
  };
}
