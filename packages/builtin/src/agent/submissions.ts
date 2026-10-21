import type { ActionContract } from "@atelier/sdk/contracts";
import { PluginApiError, type ObjectReader, type ObjectWriter } from "@atelier/sdk/runtime";
import { AgentSubmissions } from "./data.ts";

type Submission = { submissionId: string };
const signature = (contract: ActionContract<unknown>, input: Submission) => JSON.stringify({ contract: contract.id, input });

/** 提交身份同时绑定动作契约与输入；重试不再次执行，也不能借身份切换动作。 */
export function duplicateSubmission(object: ObjectReader, contract: ActionContract<unknown>, input: Submission): boolean {
  const prior = object.get(AgentSubmissions)?.[input.submissionId];
  if (prior === undefined) return false;
  if (prior !== signature(contract, input)) throw new PluginApiError("conflict", "This submission ID was already used for a different action or input.");
  return true;
}
export function rememberSubmission(object: ObjectReader, writer: ObjectWriter, contract: ActionContract<unknown>, input: Submission): void {
  writer.set(AgentSubmissions, { ...object.get(AgentSubmissions) ?? {}, [input.submissionId]: signature(contract, input) });
}
