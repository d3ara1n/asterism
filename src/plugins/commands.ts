import { jsonSchema, type ActionContract, type CreationContract, type ContractReference, type Json, type ResourceCall } from "@atelier/sdk/contracts";
import { deepFreeze } from "../shared/immutable.ts";
import { PluginApiError, validationMessage, type Preparation } from "@atelier/sdk/runtime";
import type { ContentLease } from "../runtime/content-store.ts";

type InputContract = ActionContract<unknown> | CreationContract<unknown>;
/** 宿主内部的解析结果不复用传输信封，避免将 value 再当作原始 input。 */
export interface ParsedCall extends ContractReference { value: Json; content?: ContentLease }

export function parseInput(contract: InputContract, input: Json): Json {
  const parsed = contract.schema.safeParse(input);
  if (!parsed.success) throw new PluginApiError("invalid_argument", validationMessage(parsed.error, "input"));
  return deepFreeze(jsonSchema.parse(parsed.data));
}
export function parseCall(contract: InputContract, call: ResourceCall): ParsedCall {
  if (call.id !== contract.id)
    throw new PluginApiError("invalid_argument", "The command contract is not available for this resource.");
  return { id: contract.id, value: parseInput(contract, call.input) };
}
/** 接受沿用解析结果；只有显式替换才产生需要重新解析的新输入。 */
export function applyPreparation(contract: InputContract, value: Json, result?: Preparation): Json {
  if (result?.action === "reject") throw new PluginApiError("rejected", result.message, result.code, result.display);
  return result?.action === "replace" ? parseInput(contract, result.input) : value;
}
