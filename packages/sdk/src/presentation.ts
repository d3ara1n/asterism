import { z } from "zod";
import { jsonSchema, type Json } from "./json.ts";

export const contractReferenceSchema = z.strictObject({ id: z.string().min(1).max(160) });
export type ContractReference = z.infer<typeof contractReferenceSchema>;
export interface DataContract<T extends Json = Json> extends ContractReference { schema: z.ZodType<T> }
export const presentationSchema = z.strictObject({ contract: contractReferenceSchema, data: jsonSchema });
export type Presentation = z.infer<typeof presentationSchema>;

/** Shared declarations depend on no process or UI; each end registers its own implementation. */
export function defineData<T extends Json>(id: string, schema: z.ZodType<T>): DataContract<T> {
  return { ...contractReferenceSchema.parse({ id }), schema };
}
export function reference(contract: ContractReference): ContractReference {
  return { id: contract.id };
}
export function present<T extends Json>(contract: DataContract<T>, value: unknown): Presentation {
  return { contract: reference(contract), data: contract.schema.parse(value) };
}
