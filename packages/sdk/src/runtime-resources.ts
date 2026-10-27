import type { ActionContract, CreationContract } from "./commands.ts";
import type { z } from "zod";
import { jsonSchema, type Json } from "./json.ts";
import type { ToolModelOutput } from "./tool-result.ts";
import type { ResourceContract, ImplementationContract } from "./module-contract.ts";
import type { RecordContract } from "./records.ts";
import { reference, present, type DataContract } from "./presentation.ts";
import { PluginApiError } from "./runtime.ts";
import type { ContextFile, ObjectReader, ObjectExecutor, CreationContribution, ActionContribution, CommandPreparer, CreationPreparation, ActionPreparation, ExternalPreparation, ResourceContribution, ToolContribution, Preparation, CallResult, Lifetime } from "./runtime-contracts.ts";
import { validationMessage, jsonArgumentHint } from "./tool-validation.ts";
import type { ToolCaller } from "./runtime-contracts.ts";

function parse<T>(schema: z.ZodType<T>, input: unknown, subject: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new PluginApiError("invalid_argument", validationMessage(result.error, subject));
  return result.data;
}
/** Creation and actions are invoked after host validation; types are erased only during contribution assembly. */
export function implementCreation<I, S extends Json, O extends Json>(contract: CreationContract<I, S, O>, definition: {
  prepare?(input: NoInfer<O>, context: CreationPreparation): Preparation<NoInfer<I> & Json> | Promise<Preparation<NoInfer<I> & Json>>;
  create(input: NoInfer<O>, object: ObjectExecutor): { title: string; data: NoInfer<S> };
}): CreationContribution {
  return { contract, ...definition } as CreationContribution;
}
export function implementAction<I, O extends Json>(contract: ActionContract<I, O>, definition: {
  prepare?(input: NoInfer<O>, context: ActionPreparation): Preparation<NoInfer<I> & Json> | Promise<Preparation<NoInfer<I> & Json>>;
  execute(input: NoInfer<O>, object: ObjectExecutor, signal: AbortSignal): Promise<void>;
}): ActionContribution {
  return { contract, ...definition } as ActionContribution;
}
export function implementPreparer<I, O extends Json>(contract: ActionContract<I, O>, definition: {
  id: string;
  prepare(input: NoInfer<O>, context: ExternalPreparation): Preparation<NoInfer<I> & Json> | Promise<Preparation<NoInfer<I> & Json>>;
}): CommandPreparer {
  return { contract, ...definition } as CommandPreparer;
}
export function implementResource<S extends Json, V extends Json>(
  resource: ResourceContract<S>, view: DataContract<V>, definition: {
    card?: ResourceContribution["card"];
    records?: readonly RecordContract[];
    links?: ResourceContribution["links"];
    creation?: CreationContribution;
    actions?: readonly ActionContribution[];
    project(data: NoInfer<S>, object: ObjectReader): NoInfer<V>;
    inspect(data: NoInfer<S>, object: ObjectReader): Promise<Json>;
    context?(data: NoInfer<S>, object: ObjectReader): Promise<ContextFile[]>;
    disposalWarning?(data: NoInfer<S>, object: ObjectReader): import("./i18n.ts").UiText | null;
    /** Called when an object enters the current set; external instances owned exclusively by the object register cleanup with lifetime. */
    attach?(data: NoInfer<S>, object: ObjectReader, lifetime: Lifetime): void;
  },
): ResourceContribution {
  const attach = definition.attach;
  return {
    resource, card: definition.card, records: [...definition.records ?? []], links: definition.links,
    creation: definition.creation, actions: definition.actions,
    project: (snapshot, object) => present(view, definition.project(parse(resource.stateSchema, snapshot.data, "resource"), object)),
    inspect: async (snapshot, object) => jsonSchema.parse(await definition.inspect(parse(resource.stateSchema, snapshot.data, "resource"), object)),
    context: async (snapshot, object) => definition.context?.(parse(resource.stateSchema, snapshot.data, "resource"), object) ?? [],
    disposalWarning: (snapshot, object) => definition.disposalWarning?.(parse(resource.stateSchema, snapshot.data, "resource"), object) ?? null,
    ...(attach ? { attach: (snapshot: Parameters<NonNullable<ResourceContribution["attach"]>>[0], object: ObjectReader, lifetime: Lifetime) =>
      attach(parse(resource.stateSchema, snapshot.data, "resource"), object, lifetime) } : {}),
  };
}
export function implementTool<S extends Json, T extends Json, A extends Json, D extends Json>(
  contract: ImplementationContract<S, T, A, D>, definition: {
    call(data: S, target: T, args: A, context: {
      object: ObjectExecutor; caller: ToolCaller; signal: AbortSignal; publish(data: NoInfer<D>): void;
    }): Promise<CallResult<NoInfer<D>>>;
    toModel?(data: D): ToolModelOutput;
  },
): ToolContribution {
  const identity = reference(contract);
  return {
    contract: contract as unknown as ToolContribution["contract"],
    prepare(resource, object, target, args, caller) {
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
        ].join("\n") } };
      return {
        effect: contract.effect, execution: contract.execution, implementation: identity,
        // When no projection is declared, pass JSON text to the model; preserve strings and parts unchanged without serializing them twice.
        toModel: data => definition.toModel ? definition.toModel(contract.schema.parse(data)) : JSON.stringify(data),
        async execute(signal, publish) {
          let active = true;
          const snapshot = (data: unknown) => jsonSchema.parse(contract.schema.parse(data));
          try {
            const result = await definition.call(state.data, parsedTarget.data, parsedArgs.data, { object, caller, signal,
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
