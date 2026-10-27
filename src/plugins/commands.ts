import { jsonSchema, type ActionContract, type CreationContract, type ContractReference, type Json, type ResourceCall } from "@asterism-app/sdk/contracts";
import { deepFreeze } from "../shared/immutable.ts";
import { PluginApiError, validationMessage, type Preparation } from "@asterism-app/sdk/runtime";
import type { ContentLease } from "../runtime/content-store.ts";

type InputContract = ActionContract<unknown> | CreationContract<unknown>;
/** Internal host resolution results do not reuse transport envelopes, avoiding treating value as raw input again. */
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
/** Acceptance reuses parsed results; only explicit replacement creates new input requiring parsing. */
export function applyPreparation(contract: InputContract, value: Json, result?: Preparation): Json {
  if (result?.action === "reject") throw new PluginApiError("rejected", result.message, result.code, result.display);
  return result?.action === "replace" ? parseInput(contract, result.input) : value;
}
