import type { ObjectReader, ObjectWriter } from "@asterism-app/sdk/runtime";
import { AgentSubmissions } from "./data.ts";

type Submission = { submissionId: string };

/** Submission identity deduplicates retries; the same identity reuses the accepted result. */
export function duplicateSubmission(object: ObjectReader, input: Submission): boolean {
  return object.get(AgentSubmissions)?.[input.submissionId] === true;
}
export function rememberSubmission(object: ObjectReader, writer: ObjectWriter, input: Submission): void {
  writer.set(AgentSubmissions, { ...object.get(AgentSubmissions) ?? {}, [input.submissionId]: true });
}
