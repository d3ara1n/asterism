import type { z } from "zod";
import { jsonSchema, type Json } from "./json.ts";
import type { ResourceContract } from "./module-contract.ts";
import { contractReferenceSchema, type ContractReference } from "./presentation.ts";

/** I is the invocation input and O is the schema parsing result; both are inferred automatically from the declared schema. */
export interface CreationContract<I = Json, S extends Json = Json, O extends Json = Json> extends ContractReference {
  readonly kind: "creation";
  readonly resource: ResourceContract<S>;
  readonly schema: z.ZodType<O, I>;
}
export interface ActionContract<I = Json, O extends Json = Json> extends ContractReference {
  readonly kind: "action";
  readonly resource: ResourceContract;
  readonly schema: z.ZodType<O, I>;
}
export function defineCreation<S extends Json, I, O extends Json>(resource: ResourceContract<S>, definition: ContractReference & { schema: z.ZodType<O, I> }): CreationContract<I, S, O> {
  return { ...contractReferenceSchema.parse({ id: definition.id }), kind: "creation", resource, schema: definition.schema };
}
export function defineAction<I, O extends Json>(resource: ResourceContract, definition: ContractReference & { schema: z.ZodType<O, I> }): ActionContract<I, O> {
  return { ...contractReferenceSchema.parse({ id: definition.id }), kind: "action", resource, schema: definition.schema };
}
/** Command envelopes carry only stable identity and raw JSON input; the host parses them using assembled declarations. */
export const resourceCallSchema = contractReferenceSchema.extend({ input: jsonSchema });
export type ResourceCall = z.infer<typeof resourceCallSchema>;
export function resourceCall<I, O extends Json>(contract: CreationContract<I, Json, O> | ActionContract<I, O>, input: NoInfer<I> & Json): ResourceCall {
  return { id: contract.id, input };
}
