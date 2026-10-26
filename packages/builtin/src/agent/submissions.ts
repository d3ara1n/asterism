import type { ObjectReader, ObjectWriter } from "@asterism/sdk/runtime";
import { AgentSubmissions } from "./data.ts";

type Submission = { submissionId: string };

/** 提交身份用于重试去重，相同身份沿用已受理结果。 */
export function duplicateSubmission(object: ObjectReader, input: Submission): boolean {
  return object.get(AgentSubmissions)?.[input.submissionId] === true;
}
export function rememberSubmission(object: ObjectReader, writer: ObjectWriter, input: Submission): void {
  writer.set(AgentSubmissions, { ...object.get(AgentSubmissions) ?? {}, [input.submissionId]: true });
}
