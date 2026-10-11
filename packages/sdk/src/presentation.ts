import { z } from "zod";
import { jsonSchema, type Json } from "./json.ts";

export const contractReferenceSchema = z.strictObject({ id: z.string().min(1).max(160), version: z.number().int().positive() });
export type ContractReference = z.infer<typeof contractReferenceSchema>;
export interface DataContract<T extends Json = Json> extends ContractReference { schema: z.ZodType<T> }
export const presentationSchema = z.strictObject({ contract: contractReferenceSchema, data: jsonSchema });
export type Presentation = z.infer<typeof presentationSchema>;

/** 共享声明不依赖任何进程或 UI；两端各自注册实现。 */
export function defineData<T extends Json>(id: string, version: number, schema: z.ZodType<T>): DataContract<T> {
  return { ...contractReferenceSchema.parse({ id, version }), schema };
}
export function reference(contract: ContractReference): ContractReference {
  return { id: contract.id, version: contract.version };
}
export function contractKey(contract: ContractReference): string {
  return JSON.stringify([contract.id, contract.version]);
}
export function present<T extends Json>(contract: DataContract<T>, value: unknown): Presentation {
  return { contract: reference(contract), data: contract.schema.parse(value) };
}
